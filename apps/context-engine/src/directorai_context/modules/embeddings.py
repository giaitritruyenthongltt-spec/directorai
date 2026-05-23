"""Embeddings + similarity search backed by sentence-transformers + ChromaDB.

The store lives at `<cache_dir>/chroma`. Each indexed unit is identified by:
    id     = "{media_path_hash}:{kind}:{segment_id}"
    kind   = "transcript" | "vision" | "scene"
    metadata = {media_path, start, end, kind, text}

`embed_ingest_result` is the high-level entry point: given an `IngestResult`
it walks transcript segments + vision frames + scenes and pushes embeddings
for each, returning the count inserted.

`search` runs a top-K cosine similarity query across the corpus, optionally
filtered by media_path or kind.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.models import IngestResult


@dataclass
class SearchHit:
    id: str
    text: str
    media_path: str
    kind: str
    start: float
    end: float
    score: float


_collection: Any = None
_embedder: Any = None


def _media_id(media_path: str) -> str:
    return hashlib.sha256(media_path.encode("utf-8")).hexdigest()[:12]


def _get_embedder() -> Any:
    """Lazy-load the sentence-transformers model (heavy import)."""
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer

        cfg = get_settings()
        log.info("loading_embedder", model=cfg.embeddings_model)
        _embedder = SentenceTransformer(cfg.embeddings_model)
    return _embedder


def _get_collection() -> Any:
    """Lazy-create a persistent ChromaDB collection at cache_dir/chroma."""
    global _collection
    if _collection is None:
        import chromadb

        cfg = get_settings()
        path = cfg.cache_dir / "chroma"
        path.mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(path=str(path))
        _collection = client.get_or_create_collection(
            name="directorai_clips",
            metadata={"hnsw:space": "cosine"},
        )
        log.info("chroma_collection_ready", path=str(path))
    return _collection


def _encode(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _get_embedder()
    arr = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
    return [list(map(float, row)) for row in arr]


def embed_ingest_result(result: IngestResult) -> int:
    """Push every meaningful chunk in an IngestResult into the vector store.

    Returns the number of chunks indexed.
    """
    media_id = _media_id(result.media_path)
    ids: list[str] = []
    docs: list[str] = []
    metas: list[dict[str, Any]] = []

    if result.transcribe:
        for seg in result.transcribe.segments:
            text = seg.text.strip()
            if not text:
                continue
            ids.append(f"{media_id}:transcript:{seg.id}")
            docs.append(text)
            metas.append(
                {
                    "media_path": result.media_path,
                    "kind": "transcript",
                    "start": float(seg.start),
                    "end": float(seg.end),
                    "text": text,
                }
            )

    if result.vision:
        for i, frame in enumerate(result.vision.frames):
            text = f"{frame.caption} — tags: {', '.join(frame.tags)}".strip()
            if not text:
                continue
            ids.append(f"{media_id}:vision:{i}")
            docs.append(text)
            metas.append(
                {
                    "media_path": result.media_path,
                    "kind": "vision",
                    "start": float(frame.time),
                    "end": float(frame.time),
                    "text": text,
                }
            )

    if result.scenes:
        for i, sc in enumerate(result.scenes.scenes):
            ids.append(f"{media_id}:scene:{sc.index}")
            docs.append(f"scene {sc.index} from {sc.start:.2f}s to {sc.end:.2f}s")
            metas.append(
                {
                    "media_path": result.media_path,
                    "kind": "scene",
                    "start": float(sc.start),
                    "end": float(sc.end),
                    "text": docs[-1],
                }
            )

    if not ids:
        return 0

    collection = _get_collection()
    embeddings = _encode(docs)

    # Chroma's upsert handles re-ingest of the same media gracefully
    collection.upsert(ids=ids, documents=docs, metadatas=metas, embeddings=embeddings)
    log.info("embed_ingest_done", media=result.media_path, count=len(ids))
    return len(ids)


def search(
    query: str,
    top_k: int = 10,
    media_path: str | None = None,
    kind: str | None = None,
) -> list[SearchHit]:
    """Cosine-similarity top-K over the indexed corpus."""
    if not query.strip():
        return []
    collection = _get_collection()
    qvec = _encode([query])[0]

    where: dict[str, Any] = {}
    if media_path:
        where["media_path"] = media_path
    if kind:
        where["kind"] = kind

    res = collection.query(
        query_embeddings=[qvec],
        n_results=top_k,
        where=where or None,
    )

    hits: list[SearchHit] = []
    ids = res.get("ids", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    docs = res.get("documents", [[]])[0]
    dists = res.get("distances", [[]])[0]
    for i, _id in enumerate(ids):
        m = metas[i] if i < len(metas) else {}
        # Chroma cosine distance is 1 - similarity; turn into similarity score
        dist = float(dists[i]) if i < len(dists) else 1.0
        hits.append(
            SearchHit(
                id=_id,
                text=docs[i] if i < len(docs) else m.get("text", ""),
                media_path=m.get("media_path", ""),
                kind=m.get("kind", ""),
                start=float(m.get("start", 0.0)),
                end=float(m.get("end", 0.0)),
                score=max(0.0, 1.0 - dist),
            )
        )
    return hits


def delete_media(media_path: str) -> int:
    """Remove all embeddings for a given media file."""
    collection = _get_collection()
    res = collection.get(where={"media_path": media_path})
    ids = res.get("ids", [])
    if not ids:
        return 0
    collection.delete(ids=ids)
    log.info("embed_delete", media=media_path, count=len(ids))
    return len(ids)


def collection_stats() -> dict[str, Any]:
    """Return counts grouped by kind for the current collection."""
    collection = _get_collection()
    total = collection.count()
    return {"total": total}

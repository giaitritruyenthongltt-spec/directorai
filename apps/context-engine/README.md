# DirectorAI Context Engine

Python ML service that produces structured metadata from media files:

- **Transcribe** — Whisper word-level timestamps
- **Scene detect** — PySceneDetect cut boundaries
- **Beat** — librosa BPM + beat times
- **Vision** — Claude vision API on sampled frames
- **Embeddings** — sentence-transformers for semantic clip search

Exposed via FastAPI on `:8000`, called by the Node MCP server.

## Run

```bash
# First time
uv sync
# Start service
uv run uvicorn directorai_context.main:app --reload --port 8000
```

## Layer

Layer 3 (Context Engine — adapter to ML world).

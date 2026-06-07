"""COST-1 (B5) — Cụm hoá clip gần giống bằng perceptual hash.

Nhiều clip trong 1 buổi quay rất giống nhau (cùng góc, cùng cảnh). Thay vì
gọi Vision (Gemini) cho từng clip, ta GOM clip gần giống thành cụm rồi chỉ
HIỂU 1 đại diện, suy ra cả cụm. Giảm mạnh số lần gọi Gemini.

Dùng average-hash (aHash) 8x8 = 64-bit trên 1 khung giữa clip; gom theo
khoảng cách Hamming.
"""

from __future__ import annotations

import numpy as np

from directorai_context.logger import log
from directorai_context.modules import frame_sampler as fs

# Ngưỡng độ lệch chuẩn (trên thang 0-255) coi 1 khung là "phẳng" (đen/trắng/
# mờ đều) → KHÔNG đáng tin để gom cụm bằng aHash.
_FLAT_STD_THRESHOLD = 6.0


def _ahash(image_bgr: np.ndarray) -> int | None:
    """Average-hash 64-bit từ 1 khung BGR. Trả None nếu khung quá phẳng
    (đen/trắng đều) → aHash vô nghĩa (mọi khung phẳng đều ra hash 0, sẽ gom
    NHẦM các clip lỗi tối đen vào 1 cụm)."""
    import cv2

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (8, 8), interpolation=cv2.INTER_AREA)
    if float(small.std()) < _FLAT_STD_THRESHOLD:
        return None  # khung phẳng → không gom (để xét riêng từng clip)
    mean = float(small.mean())
    bits = (small > mean).flatten()
    h = 0
    for b in bits:
        h = (h << 1) | int(b)
    return h


def _hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def clip_hash(media_path: str) -> int | None:
    """aHash của 1 khung giữa clip. None nếu lỗi đọc."""
    try:
        frames = fs.sample(media_path, count=1, max_dim=256)
        if not frames:
            return None
        return _ahash(frames[0].image)
    except Exception as e:
        log.error("clip_hash_failed", media=media_path, error=str(e))
        return None


def cluster_clips(clip_paths: list[str], max_distance: int = 6) -> dict:
    """Gom clip gần giống. Trả {clusters:[{representative, members:[...]}],
    n_clips, n_clusters, reduction}.

    max_distance: khoảng cách Hamming tối đa (0..64) coi là "giống".
    """
    hashes: list[tuple[str, int | None]] = [(p, clip_hash(p)) for p in clip_paths]

    clusters: list[dict] = []
    for path, h in hashes:
        if h is None:
            # Không hash được → cụm riêng (luôn xem).
            clusters.append({"representative": path, "members": [path], "hash": None})
            continue
        placed = False
        for c in clusters:
            ch = c.get("hash")
            if ch is not None and _hamming(h, ch) <= max_distance:
                c["members"].append(path)
                placed = True
                break
        if not placed:
            clusters.append({"representative": path, "members": [path], "hash": h})

    # Bỏ field hash khỏi output (nội bộ).
    out_clusters = [
        {"representative": c["representative"], "members": c["members"]} for c in clusters
    ]
    n = len(clip_paths)
    k = len(out_clusters)
    log.info("cluster_clips_done", n_clips=n, n_clusters=k)
    return {
        "clusters": out_clusters,
        "n_clips": n,
        "n_clusters": k,
        # tiết kiệm: chỉ cần hiểu k đại diện thay vì n clip.
        "reduction": round(1.0 - (k / n), 3) if n else 0.0,
    }

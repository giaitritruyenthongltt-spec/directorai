"""Sprint F.1 — Color analyzer.

Extract dominant colors + brightness / saturation / mood per clip frame.
Lightweight (k-means on a downsampled HSV image), no ML model required.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class DominantColor:
    """One cluster from the dominant-color extraction."""

    r: int
    g: int
    b: int
    fraction: float  # 0-1 share of pixels


@dataclass(frozen=True)
class ColorAnalysis:
    """All color stats for a single frame (or averaged across frames)."""

    dominants: list[DominantColor]
    brightness: float  # 0-1 average V channel
    saturation: float  # 0-1 average S channel
    contrast: float  # 0-1 std-dev of V
    warmth: float  # -1 (cool/blue) … 1 (warm/red)
    mood: str  # 'warm' | 'cool' | 'neutral' | 'dark' | 'bright'

    def to_dict(self) -> dict[str, object]:
        out = asdict(self)
        out["dominants"] = [asdict(d) for d in self.dominants]
        return out


def _kmeans_dominants(image_bgr: np.ndarray, k: int = 5) -> list[DominantColor]:
    """Downsample then k-means in BGR space — fast on small images."""
    # Resize for speed — 96px max
    h, w = image_bgr.shape[:2]
    scale = 96.0 / max(h, w)
    if scale < 1.0:
        image_bgr = cv2.resize(
            image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA
        )
    flat = image_bgr.reshape(-1, 3).astype(np.float32)
    if len(flat) < k:
        k = max(1, len(flat))
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, labels, centers = cv2.kmeans(
        flat, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS
    )
    counts = np.bincount(labels.flatten(), minlength=k)
    total = counts.sum()
    dominants: list[DominantColor] = []
    for i in range(k):
        b, g, r = centers[i]
        dominants.append(
            DominantColor(
                r=int(round(r)),
                g=int(round(g)),
                b=int(round(b)),
                fraction=float(counts[i] / total) if total > 0 else 0.0,
            )
        )
    dominants.sort(key=lambda d: d.fraction, reverse=True)
    return dominants


def _classify_mood(brightness: float, saturation: float, warmth: float) -> str:
    """Coarse mood bucket from the 3 axes."""
    if brightness < 0.20:
        return "dark"
    if brightness > 0.80 and saturation < 0.20:
        return "bright"
    if warmth > 0.20:
        return "warm"
    if warmth < -0.20:
        return "cool"
    return "neutral"


def analyze_frame_color(image_bgr: np.ndarray) -> ColorAnalysis:
    """Full color stats for one frame."""
    if image_bgr.ndim != 3 or image_bgr.shape[2] != 3:
        raise ValueError("analyze_frame_color expects a 3-channel BGR image")

    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    v = hsv[:, :, 2].astype(np.float32) / 255.0
    s = hsv[:, :, 1].astype(np.float32) / 255.0

    brightness = float(v.mean())
    saturation = float(s.mean())
    contrast = float(v.std())

    # Warmth: more red+yellow vs blue. Use mean B channel diff in BGR.
    b_chan = image_bgr[:, :, 0].astype(np.float32).mean()
    r_chan = image_bgr[:, :, 2].astype(np.float32).mean()
    warmth = float((r_chan - b_chan) / 255.0)
    warmth = max(-1.0, min(1.0, warmth))

    dominants = _kmeans_dominants(image_bgr, k=5)
    mood = _classify_mood(brightness, saturation, warmth)
    return ColorAnalysis(
        dominants=dominants,
        brightness=brightness,
        saturation=saturation,
        contrast=contrast,
        warmth=warmth,
        mood=mood,
    )


def analyze_clip_color(frames_bgr: list[np.ndarray]) -> ColorAnalysis:
    """Average color stats across a list of sampled frames.

    Dominant clusters are re-run on a stack of frames concatenated
    horizontally so the k-means sees the whole clip's color distribution
    (not just the first frame).
    """
    if not frames_bgr:
        raise ValueError("frames_bgr must be non-empty")
    # Normalise sizes — resize each to 96 wide so concatenation is cheap
    resized: list[np.ndarray] = []
    for f in frames_bgr:
        h, w = f.shape[:2]
        scale = 96.0 / w
        if scale < 1.0:
            resized.append(
                cv2.resize(f, (96, int(h * scale)), interpolation=cv2.INTER_AREA)
            )
        else:
            resized.append(f)
    # Match heights for concatenation
    min_h = min(f.shape[0] for f in resized)
    cropped = [f[:min_h, :, :] for f in resized]
    stacked = np.hstack(cropped)

    per_frame_stats = [analyze_frame_color(f) for f in frames_bgr]
    brightness = float(np.mean([s.brightness for s in per_frame_stats]))
    saturation = float(np.mean([s.saturation for s in per_frame_stats]))
    contrast = float(np.mean([s.contrast for s in per_frame_stats]))
    warmth = float(np.mean([s.warmth for s in per_frame_stats]))
    mood = _classify_mood(brightness, saturation, warmth)

    return ColorAnalysis(
        dominants=_kmeans_dominants(stacked, k=5),
        brightness=brightness,
        saturation=saturation,
        contrast=contrast,
        warmth=warmth,
        mood=mood,
    )

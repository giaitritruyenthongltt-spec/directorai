"""Sprint B.2 — Per-frame quality scoring.

All metrics return a 0.0-1.0 score where 1.0 = ideal. The composite
score is a weighted average.

Metrics
=======
- blur:      Laplacian variance (higher = sharper). Normalised to 0-1
             with a typical good-camera baseline of 200.
- exposure:  Histogram-based. Penalises clipping in top/bottom 5%
             of the brightness range.
- focus:     High-frequency energy proxy (Sobel magnitude mean).
- framing:   Rule-of-thirds — bright subjects near the four thirds
             intersections score higher than centered subjects (which
             often indicate amateur framing).

The composite formula is intentionally simple and tunable. Calibration
data lives in this module's CALIBRATION constants — we'll adjust them
in Sprint H after we score the user's real footage.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import cv2
import numpy as np

# ─── Calibration constants ──────────────────────────────────────────────
# These were picked from cinematography rule-of-thumb + a sanity check
# on the first 50 clips of the user's project. Revisit in Sprint H.

BLUR_GOOD_VARIANCE = 200.0
"""Laplacian variance above this → score 1.0. Below → linear ramp to 0."""

EXPOSURE_DARK_BINS = 10
"""Number of histogram bins from the bottom counted as 'clipped dark'.
   With bins=10 we treat values 0..9 as crushed black."""

EXPOSURE_BRIGHT_BINS = 10
"""Mirror of EXPOSURE_DARK_BINS — values 246..255 are blown highlights."""

EXPOSURE_BAD_PCT_CLIPPED = 0.50
"""If >50% of pixels are in the dark+bright clipped tails, exposure score is 0.
   A gradient image will have ~8% in tails which is fine; a flat near-black
   image will have ~100% which scores 0."""

FOCUS_GOOD_MEAN_SOBEL = 25.0

FRAMING_THIRDS_TOLERANCE_PX = 0.08
"""Subject anchor within this fraction of a third-intersection scores 1.0."""

FRAMING_SUBJECT_PERCENTILE = 99.0
"""Use the brightest 1% of pixels as the 'subject' for centroid calculation.
   90th percentile was too lax — small bright objects on dark backgrounds
   still got the whole-image centroid."""

# Weights for composite — must sum to 1.0
WEIGHTS = {
    "blur": 0.35,
    "exposure": 0.30,
    "focus": 0.20,
    "framing": 0.15,
}
assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-6


@dataclass(frozen=True)
class QualityScore:
    blur: float
    exposure: float
    focus: float
    framing: float
    composite: float

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


# ─── Metric implementations ─────────────────────────────────────────────


def _blur_score(gray: np.ndarray) -> float:
    """Laplacian variance — classic sharpness indicator."""
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    variance = float(lap.var())
    # Linear ramp 0 → BLUR_GOOD_VARIANCE; clip above 1.0
    return min(1.0, variance / BLUR_GOOD_VARIANCE)


def _exposure_score(gray: np.ndarray) -> float:
    """Penalise clipping. Histogram split into 256 bins; the bottom N + top N
    bins are 'clipped'. Pure-black or pure-white images saturate one tail
    so the score collapses to 0."""
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    hist = hist.flatten() / hist.sum()
    clipped = float(
        hist[:EXPOSURE_DARK_BINS].sum() + hist[-EXPOSURE_BRIGHT_BINS:].sum()
    )
    if clipped >= EXPOSURE_BAD_PCT_CLIPPED:
        return 0.0
    return 1.0 - (clipped / EXPOSURE_BAD_PCT_CLIPPED)


def _focus_score(gray: np.ndarray) -> float:
    """High-frequency energy via Sobel gradient magnitude."""
    sx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    mag = np.hypot(sx, sy)
    mean_mag = float(mag.mean())
    return min(1.0, mean_mag / FOCUS_GOOD_MEAN_SOBEL)


def _framing_score(gray: np.ndarray) -> float:
    """Reward subjects near rule-of-thirds intersections.

    Subject location = centroid of the brightest 1% of pixels (top
    percentile threshold). If that centroid lies within FRAMING_
    THIRDS_TOLERANCE of any of the 4 thirds-intersections we score 1.0.
    Falls off linearly as the centroid moves toward dead-centre.
    """
    h, w = gray.shape[:2]
    threshold = float(np.percentile(gray, FRAMING_SUBJECT_PERCENTILE))
    # Use strictly-greater to avoid catching the whole image when
    # background == threshold (e.g. flat-coloured fill).
    mask = gray > threshold
    if not mask.any():
        # Fallback: nothing stands out → use top 1% by absolute brightness.
        mask = gray >= max(threshold, gray.max() - 1)
    if not mask.any():
        return 0.5  # neutral
    ys, xs = np.where(mask)
    cx = float(xs.mean()) / w
    cy = float(ys.mean()) / h
    thirds = [(1 / 3, 1 / 3), (2 / 3, 1 / 3), (1 / 3, 2 / 3), (2 / 3, 2 / 3)]
    best = min(((cx - tx) ** 2 + (cy - ty) ** 2) ** 0.5 for tx, ty in thirds)
    if best <= FRAMING_THIRDS_TOLERANCE_PX:
        return 1.0
    return max(0.3, 1.0 - (best / 0.5))


# ─── Public API ─────────────────────────────────────────────────────────


def score_frame(bgr: np.ndarray) -> QualityScore:
    """Score a single frame. `bgr` is OpenCV's native H x W x 3 uint8."""
    if bgr.ndim != 3 or bgr.shape[2] != 3:
        raise ValueError("score_frame expects a 3-channel BGR image")
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    blur = _blur_score(gray)
    exposure = _exposure_score(gray)
    focus = _focus_score(gray)
    framing = _framing_score(gray)
    composite = (
        blur * WEIGHTS["blur"]
        + exposure * WEIGHTS["exposure"]
        + focus * WEIGHTS["focus"]
        + framing * WEIGHTS["framing"]
    )
    return QualityScore(
        blur=blur,
        exposure=exposure,
        focus=focus,
        framing=framing,
        composite=composite,
    )


def score_frames(frames: list[np.ndarray]) -> QualityScore:
    """Average per-frame scores. Useful for whole-clip quality."""
    if not frames:
        raise ValueError("frames must be non-empty")
    scores = [score_frame(f) for f in frames]
    return QualityScore(
        blur=float(np.mean([s.blur for s in scores])),
        exposure=float(np.mean([s.exposure for s in scores])),
        focus=float(np.mean([s.focus for s in scores])),
        framing=float(np.mean([s.framing for s in scores])),
        composite=float(np.mean([s.composite for s in scores])),
    )

"""Sprint B.2 — Quality scorer tests.

Synthetic frames let us verify scores move in the right direction.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from directorai_context.modules import quality as q


def _sharp_image(size: int = 480) -> np.ndarray:
    """Checkerboard pattern — high frequency content, should score high blur."""
    img = np.zeros((size, size, 3), dtype=np.uint8)
    for y in range(0, size, 20):
        for x in range(0, size, 20):
            if (x // 20 + y // 20) % 2 == 0:
                img[y : y + 20, x : x + 20] = 255
    return img


def _blurry_image(size: int = 480) -> np.ndarray:
    """Heavy Gaussian blur over the sharp image."""
    sharp = _sharp_image(size)
    return cv2.GaussianBlur(sharp, (51, 51), 30)


def _underexposed_image(size: int = 480) -> np.ndarray:
    """Everything near black — most pixels in bottom 5 bins."""
    return np.full((size, size, 3), 5, dtype=np.uint8)


def _overexposed_image(size: int = 480) -> np.ndarray:
    """Everything near white — pixels clipped in top bins."""
    return np.full((size, size, 3), 250, dtype=np.uint8)


def _well_exposed_image(size: int = 480) -> np.ndarray:
    """Gradient from dark to bright — full histogram coverage."""
    img = np.zeros((size, size, 3), dtype=np.uint8)
    for y in range(size):
        img[y, :] = int(255 * y / size)
    return img


def _well_framed_image(size: int = 480) -> np.ndarray:
    """Bright spot at the top-left thirds intersection."""
    img = np.full((size, size, 3), 40, dtype=np.uint8)
    # Circle at (size/3, size/3)
    cv2.circle(img, (size // 3, size // 3), 40, (250, 250, 250), -1)
    return img


def _centered_image(size: int = 480) -> np.ndarray:
    """Bright spot dead-center — should score worse than rule-of-thirds."""
    img = np.full((size, size, 3), 40, dtype=np.uint8)
    cv2.circle(img, (size // 2, size // 2), 40, (250, 250, 250), -1)
    return img


# ─── Blur ───────────────────────────────────────────────────────────────


def test_sharp_scores_higher_blur_than_blurry() -> None:
    sharp_score = q.score_frame(_sharp_image()).blur
    blurry_score = q.score_frame(_blurry_image()).blur
    assert sharp_score > blurry_score
    # Sharp should approach the 1.0 ceiling
    assert sharp_score > 0.5
    # Blurry should be near zero
    assert blurry_score < 0.1


# ─── Exposure ───────────────────────────────────────────────────────────


def test_underexposed_scores_zero() -> None:
    s = q.score_frame(_underexposed_image()).exposure
    assert s == 0.0


def test_overexposed_scores_zero() -> None:
    s = q.score_frame(_overexposed_image()).exposure
    assert s == 0.0


def test_well_exposed_scores_high() -> None:
    s = q.score_frame(_well_exposed_image()).exposure
    assert s > 0.8


# ─── Framing ───────────────────────────────────────────────────────────


def test_thirds_framing_beats_centered() -> None:
    thirds = q.score_frame(_well_framed_image()).framing
    centered = q.score_frame(_centered_image()).framing
    assert thirds > centered


# ─── Composite ─────────────────────────────────────────────────────────


def test_composite_in_range() -> None:
    """Whatever the image, composite must be in [0, 1]."""
    for fn in (_sharp_image, _blurry_image, _underexposed_image, _well_exposed_image):
        comp = q.score_frame(fn()).composite
        assert 0.0 <= comp <= 1.0


def test_score_frames_averages() -> None:
    frames = [_sharp_image(), _well_exposed_image(), _well_framed_image()]
    avg = q.score_frames(frames)
    # Average composite should be > 0.4 with these decent inputs
    assert avg.composite > 0.4


def test_score_frame_rejects_grayscale() -> None:
    gray = np.zeros((100, 100), dtype=np.uint8)
    with pytest.raises(ValueError):
        q.score_frame(gray)


def test_score_frames_empty_raises() -> None:
    with pytest.raises(ValueError):
        q.score_frames([])

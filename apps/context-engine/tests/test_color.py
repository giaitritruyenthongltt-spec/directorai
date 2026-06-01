"""Sprint F.1 — Color analyzer tests using synthetic frames."""

from __future__ import annotations

import numpy as np
import pytest

from directorai_context.modules.color import (
    analyze_clip_color,
    analyze_frame_color,
)


def _solid(r: int, g: int, b: int, size: int = 200) -> np.ndarray:
    """Solid BGR image (OpenCV order)."""
    img = np.zeros((size, size, 3), dtype=np.uint8)
    img[:, :, 0] = b
    img[:, :, 1] = g
    img[:, :, 2] = r
    return img


def test_solid_red_classified_warm() -> None:
    result = analyze_frame_color(_solid(220, 30, 30))
    assert result.warmth > 0.3
    assert result.mood in ("warm", "bright")
    # Dominant should be ~red
    top = result.dominants[0]
    assert top.r > 150
    assert top.b < 100


def test_solid_blue_classified_cool() -> None:
    result = analyze_frame_color(_solid(20, 20, 200))
    assert result.warmth < -0.3
    assert result.mood == "cool"
    top = result.dominants[0]
    assert top.b > 150
    assert top.r < 100


def test_dark_image_mood() -> None:
    result = analyze_frame_color(_solid(15, 15, 15))
    assert result.brightness < 0.10
    assert result.mood == "dark"


def test_bright_white_image_mood() -> None:
    result = analyze_frame_color(_solid(250, 250, 250))
    assert result.brightness > 0.90
    assert result.saturation < 0.10
    assert result.mood == "bright"


def test_neutral_grey() -> None:
    result = analyze_frame_color(_solid(128, 128, 128))
    assert abs(result.warmth) < 0.1
    assert result.mood == "neutral"


def test_dominant_fractions_sum_to_one() -> None:
    img = _solid(120, 80, 200)
    result = analyze_frame_color(img)
    total = sum(d.fraction for d in result.dominants)
    assert abs(total - 1.0) < 1e-3


def test_dominants_sorted_desc() -> None:
    img = _solid(100, 100, 100)
    result = analyze_frame_color(img)
    fractions = [d.fraction for d in result.dominants]
    assert fractions == sorted(fractions, reverse=True)


def test_rejects_grayscale() -> None:
    with pytest.raises(ValueError):
        analyze_frame_color(np.zeros((10, 10), dtype=np.uint8))


def test_clip_average_combines_frames() -> None:
    frames = [_solid(255, 0, 0), _solid(0, 0, 255)]
    result = analyze_clip_color(frames)
    # Average of pure red + pure blue → near-zero warmth
    assert abs(result.warmth) < 0.3


def test_empty_frames_list_raises() -> None:
    with pytest.raises(ValueError):
        analyze_clip_color([])


def test_to_dict_serializable() -> None:
    import json

    result = analyze_frame_color(_solid(100, 150, 200))
    payload = json.dumps(result.to_dict())
    assert "dominants" in payload
    assert "mood" in payload

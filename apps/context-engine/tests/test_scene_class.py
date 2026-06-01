"""F6 — Unit tests for heuristic scene classifier."""

from __future__ import annotations

import numpy as np
import pytest

from directorai_context.modules.scene_class import (
    VALID_CLASSES,
    _aesthetic_lite,
    _classify,
    _edge_density,
    _motion_score,
)


def test_motion_score_zero_when_frames_identical() -> None:
    f = np.zeros((20, 20), dtype=np.uint8)
    score = _motion_score([f, f.copy(), f.copy()])
    assert score == 0.0


def test_motion_score_high_when_frames_differ() -> None:
    f1 = np.zeros((20, 20), dtype=np.uint8)
    f2 = np.full((20, 20), 200, dtype=np.uint8)
    score = _motion_score([f1, f2, f1])
    # mean(|0-200|/255) = 200/255 ≈ 0.78
    assert score > 0.5


def test_edge_density_zero_for_flat_image() -> None:
    f = np.full((40, 40), 128, dtype=np.uint8)
    assert _edge_density([f]) == 0.0


def test_edge_density_positive_for_checkerboard() -> None:
    rows = np.tile(np.r_[0, 255], 20)
    f = np.tile(rows, (40, 1)).astype(np.uint8)
    d = _edge_density([f])
    assert d >= 0.04  # Canny on a 40x40 chequerboard yields ~0.05


@pytest.mark.parametrize(
    ("motion", "brightness", "contrast", "edge", "expected"),
    [
        (0.0, 0.1, 0.1, 0.05, "lowlight"),
        (0.2, 0.5, 0.2, 0.1, "action"),
        (0.001, 0.5, 0.1, 0.05, "static"),
        (0.02, 0.6, 0.3, 0.18, "landscape"),
        (0.02, 0.5, 0.1, 0.03, "closeup"),
        (0.02, 0.5, 0.25, 0.08, "dialog"),
    ],
)
def test_classify_cascade(
    motion: float,
    brightness: float,
    contrast: float,
    edge: float,
    expected: str,
) -> None:
    cls = _classify(motion=motion, brightness=brightness, contrast=contrast, edge_density=edge)
    assert cls == expected


def test_aesthetic_lite_bounded_and_monotonic() -> None:
    low = _aesthetic_lite(0.05, 0.1, 0.02, 0.0)
    high = _aesthetic_lite(0.6, 0.7, 0.18, 0.06)
    assert 0.0 <= low <= 1.0
    assert 0.0 <= high <= 1.0
    assert high > low


def test_valid_classes_is_complete() -> None:
    # Anchor test — guards against silent vocab drift between Python +
    # any TS consumer that mirrors the class list.
    assert set(VALID_CLASSES) == {
        "landscape",
        "closeup",
        "action",
        "dialog",
        "static",
        "lowlight",
    }

"""Scene detection tests — content vs adaptive + thumbnails.

Dùng video tổng hợp (cv2.VideoWriter) gồm nhiều khối màu KHÁC HẲN nhau nối
tiếp → tạo điểm cắt cứng rõ rệt → kiểm cả 2 detector phát hiện được + thumbnail.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
import numpy as np
import pytest

from directorai_context.modules import scene as sc


def _make_multiscene_video(
    path: str,
    seg_colors: list[tuple[int, int, int]],
    seg_sec: float = 1.0,
    fps: int = 24,
    width: int = 320,
    height: int = 180,
) -> None:
    """Mỗi màu trong seg_colors = 1 đoạn liên tục → cắt cứng giữa các đoạn."""
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(path, fourcc, fps, (width, height))
    per = int(seg_sec * fps)
    for color in seg_colors:
        block = np.full((height, width, 3), color, dtype=np.uint8)
        for _ in range(per):
            writer.write(block.copy())
    writer.release()


@pytest.fixture
def multiscene_clip() -> str:
    # 4 đoạn tương phản tối đa (đen↔trắng) → 3 cú cắt rõ → kỳ vọng 4 cảnh.
    # (delta khung hình cực lớn, vượt xa ngưỡng → bền với nén mp4v của test).
    colors = [(0, 0, 0), (255, 255, 255), (0, 0, 0), (255, 255, 255)]
    with tempfile.TemporaryDirectory() as tmp:
        p = str(Path(tmp) / "multiscene.mp4")
        _make_multiscene_video(p, colors)
        yield p


def test_content_detects_multiple_scenes(multiscene_clip: str) -> None:
    res = sc.detect_scenes(
        multiscene_clip, detector="content", threshold=27, min_scene_len_sec=0.3
    )
    assert res.detector == "content"
    assert res.fps > 0
    assert len(res.scenes) >= 3  # ít nhất bắt được vài cú cắt
    # Cảnh liên tục, không chồng lấn, có thời lượng dương
    for s in res.scenes:
        assert s.duration > 0
        assert s.end > s.start


def test_adaptive_detects_scenes(multiscene_clip: str) -> None:
    res = sc.detect_scenes(
        multiscene_clip, detector="adaptive", adaptive_threshold=3.0, min_scene_len_sec=0.3
    )
    assert res.detector == "adaptive"
    assert len(res.scenes) >= 2


def test_thumbnails_populate_data_uri(multiscene_clip: str) -> None:
    res = sc.detect_scenes(
        multiscene_clip, detector="content", threshold=27, min_scene_len_sec=0.3,
        thumbnails=True, thumb_width=96,
    )
    assert res.scenes
    for s in res.scenes:
        assert s.thumb is not None
        assert s.thumb.startswith("data:image/jpeg;base64,")


def test_no_thumbnails_by_default(multiscene_clip: str) -> None:
    res = sc.detect_scenes(multiscene_clip, detector="content", min_scene_len_sec=0.3)
    assert all(s.thumb is None for s in res.scenes)


def test_unknown_detector_falls_back_to_content(multiscene_clip: str) -> None:
    res = sc.detect_scenes(multiscene_clip, detector="bogus", min_scene_len_sec=0.3)
    assert res.detector == "content"


def test_build_detector_types() -> None:
    from scenedetect import AdaptiveDetector, ContentDetector

    assert isinstance(sc._build_detector("adaptive", 3.0, 5), AdaptiveDetector)
    assert isinstance(sc._build_detector("content", 27.0, 5), ContentDetector)
    # Loại lạ → ContentDetector (fallback an toàn)
    assert isinstance(sc._build_detector("xyz", 27.0, 5), ContentDetector)


def test_group_merges_similar_shots(multiscene_clip: str) -> None:
    # 4 đoạn đen/trắng xen kẽ → ngưỡng cao → mỗi shot 1 nhóm (không gộp nhầm).
    res = sc.detect_scenes(
        multiscene_clip, detector="content", threshold=27, min_scene_len_sec=0.3,
        group=True, group_threshold=0.9,
    )
    assert res.groups
    total_shots = sum(g.shot_count for g in res.groups)
    assert total_shots == len(res.scenes)  # mọi shot thuộc đúng 1 nhóm
    # shot_indices liên tục, không trùng, phủ hết
    flat = [i for g in res.groups for i in g.shot_indices]
    assert flat == sorted(flat)
    assert flat == list(range(len(res.scenes)))


def test_no_groups_by_default(multiscene_clip: str) -> None:
    res = sc.detect_scenes(multiscene_clip, detector="content", min_scene_len_sec=0.3)
    assert res.groups == []


@pytest.fixture
def singleshot_clip() -> str:
    # 1 màu thuần liên tục → KHÔNG có cú cắt → PySceneDetect trả [].
    with tempfile.TemporaryDirectory() as tmp:
        p = str(Path(tmp) / "oneshot.mp4")
        _make_multiscene_video(p, [(40, 80, 120)], seg_sec=2.0)
        yield p


def test_nocut_falls_back_to_single_scene(singleshot_clip: str) -> None:
    # B4 — video 1-shot vẫn phải ra ĐÚNG 1 cảnh phủ cả video (không vỡ pipeline).
    res = sc.detect_scenes(singleshot_clip, detector="content", min_scene_len_sec=0.3)
    assert len(res.scenes) == 1
    assert res.scenes[0].start == 0.0
    assert res.scenes[0].duration > 1.0  # ~2s


def test_missing_file_raises() -> None:
    with pytest.raises(FileNotFoundError):
        sc.detect_scenes("Z:/nope/missing.mp4")

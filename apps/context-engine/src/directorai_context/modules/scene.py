"""Scene detection via PySceneDetect."""

from __future__ import annotations

from pathlib import Path

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.models import Scene, SceneResult


def detect_scenes(
    media_path: str,
    threshold: float | None = None,
    min_scene_len_sec: float | None = None,
) -> SceneResult:
    """Detect scene cuts in a video using content-based detection."""
    from scenedetect import ContentDetector, SceneManager, open_video

    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    cfg = get_settings()
    thr = threshold if threshold is not None else cfg.scene_threshold
    min_len = (
        min_scene_len_sec if min_scene_len_sec is not None else cfg.scene_min_scene_len
    )

    log.info("scene_detect_start", media=str(path), threshold=thr, min_len=min_len)

    video = open_video(str(path))
    fps = video.frame_rate
    min_len_frames = max(1, int(min_len * fps))

    manager = SceneManager()
    manager.add_detector(ContentDetector(threshold=thr, min_scene_len=min_len_frames))
    manager.detect_scenes(video=video, show_progress=False)

    scene_list = manager.get_scene_list()
    scenes: list[Scene] = []
    for i, (start, end) in enumerate(scene_list):
        start_sec = start.get_seconds()
        end_sec = end.get_seconds()
        scenes.append(
            Scene(index=i, start=start_sec, end=end_sec, duration=end_sec - start_sec)
        )

    log.info("scene_detect_done", count=len(scenes))
    return SceneResult(media_path=str(path), scenes=scenes)

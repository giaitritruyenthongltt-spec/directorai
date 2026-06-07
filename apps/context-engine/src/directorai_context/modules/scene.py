"""Scene detection via PySceneDetect — content & adaptive, optional thumbnails.

Quy tắc cắt KHÔNG ngẫu nhiên: đo độ KHÁC giữa 2 khung hình kề nhau, vượt ngưỡng
→ điểm cắt (đúng nơi người dựng cắt cứng). Hai detector:

* ``content``  — ContentDetector: delta HSV+cạnh vs NGƯỠNG CỐ ĐỊNH (mặc định 27).
  Đơn giản, nhưng footage chuyển động mạnh (pan/nổ/chớp nòng Nerf) dễ cắt-thừa.
* ``adaptive`` — AdaptiveDetector: so delta với TRUNG-BÌNH-TRƯỢT cục bộ → chuyển
  động đều không kích, chỉ cú cắt thật (vọt đột ngột) mới kích. Bền hơn cho action.
"""

from __future__ import annotations

import base64
from pathlib import Path

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.models import Scene, SceneGroup, SceneResult


def _build_detector(detector: str, threshold: float, min_len_frames: int):
    """Tạo detector PySceneDetect theo loại. Fallback 'content' nếu thiếu Adaptive."""
    import scenedetect

    if detector == "adaptive" and hasattr(scenedetect, "AdaptiveDetector"):
        return scenedetect.AdaptiveDetector(
            adaptive_threshold=threshold, min_scene_len=min_len_frames
        )
    from scenedetect import ContentDetector

    return ContentDetector(threshold=threshold, min_scene_len=min_len_frames)


def _attach_thumbnails(media_path: str, scenes: list[Scene], width: int) -> None:
    """Gắn data-URI JPEG (frame GIỮA mỗi cảnh) vào Scene.thumb để duyệt cắt trực
    quan. Mọi lỗi đều nuốt — thumbnail là tuỳ chọn, không được làm hỏng detect."""
    try:
        import cv2
    except Exception as e:
        log.warning("scene_thumb_no_cv2", error=str(e))
        return
    cap = cv2.VideoCapture(media_path)
    if not cap.isOpened():
        log.warning("scene_thumb_open_fail", media=media_path)
        return
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        for sc in scenes:
            mid_sec = (sc.start + sc.end) / 2.0
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(mid_sec * fps))
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            h, w = frame.shape[:2]
            if w > width and w > 0:
                new_h = max(1, round(h * width / w))
                frame = cv2.resize(frame, (width, new_h), interpolation=cv2.INTER_AREA)
            ok2, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if not ok2:
                continue
            b64 = base64.b64encode(buf.tobytes()).decode("ascii")
            sc.thumb = f"data:image/jpeg;base64,{b64}"
    finally:
        cap.release()


def _group_scenes(
    media_path: str, scenes: list[Scene], threshold: float
) -> list[SceneGroup]:
    """Gom shot→CẢNH ngữ-nghĩa: so histogram màu (HSV) frame-giữa của 2 shot KỀ
    nhau; tương-quan >= threshold → cùng bối cảnh → cùng 1 cảnh. Đây là 'cảnh'
    thật (gồm nhiều cú máy), khác 'shot' (giữa 2 cú cắt). Lỗi → trả [] (degrade)."""
    if not scenes:
        return []
    try:
        import cv2
    except Exception as e:  # pragma: no cover
        log.warning("scene_group_no_cv2", error=str(e))
        return []
    cap = cv2.VideoCapture(media_path)
    if not cap.isOpened():
        return []
    hists: list[object | None] = []
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        for s in scenes:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int((s.start + s.end) / 2.0 * fps))
            ok, frame = cap.read()
            if not ok or frame is None:
                hists.append(None)
                continue
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            h = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
            cv2.normalize(h, h)
            hists.append(h)
    finally:
        cap.release()

    # Gộp tuyến tính các shot kề nhau giống nhau.
    runs: list[list[int]] = [[0]]
    for i in range(1, len(scenes)):
        a, b = hists[i - 1], hists[i]
        corr = (
            float(cv2.compareHist(a, b, cv2.HISTCMP_CORREL))
            if a is not None and b is not None
            else 0.0
        )
        if corr >= threshold:
            runs[-1].append(i)
        else:
            runs.append([i])

    groups: list[SceneGroup] = []
    for gi, members in enumerate(runs):
        st = scenes[members[0]].start
        en = scenes[members[-1]].end
        groups.append(
            SceneGroup(
                index=gi,
                start=st,
                end=en,
                duration=en - st,
                shot_indices=members,
                shot_count=len(members),
            )
        )
    return groups


def detect_scenes(
    media_path: str,
    threshold: float | None = None,
    min_scene_len_sec: float | None = None,
    detector: str | None = None,
    adaptive_threshold: float | None = None,
    thumbnails: bool = False,
    thumb_width: int | None = None,
    group: bool = False,
    group_threshold: float | None = None,
) -> SceneResult:
    """Phát hiện điểm cắt cảnh (content-change). detector='content'|'adaptive'."""
    from scenedetect import SceneManager, open_video

    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    cfg = get_settings()
    det = (detector or cfg.scene_detector).lower()
    if det == "adaptive":
        thr = (
            adaptive_threshold
            if adaptive_threshold is not None
            else cfg.scene_adaptive_threshold
        )
    else:
        det = "content"
        thr = threshold if threshold is not None else cfg.scene_threshold
    min_len = (
        min_scene_len_sec if min_scene_len_sec is not None else cfg.scene_min_scene_len
    )

    log.info(
        "scene_detect_start",
        media=str(path),
        detector=det,
        threshold=thr,
        min_len=min_len,
    )

    video = open_video(str(path))
    fps = video.frame_rate
    min_len_frames = max(1, int(min_len * fps))

    manager = SceneManager()
    manager.add_detector(_build_detector(det, thr, min_len_frames))
    manager.detect_scenes(video=video, show_progress=False)

    scene_list = manager.get_scene_list()
    scenes: list[Scene] = []
    for i, (start, end) in enumerate(scene_list):
        start_sec = start.seconds
        end_sec = end.seconds
        scenes.append(
            Scene(index=i, start=start_sec, end=end_sec, duration=end_sec - start_sec)
        )

    # B4 — video KHÔNG có cú cắt nào (1-shot / clip raw) → PySceneDetect trả [].
    # Coi CẢ video là 1 cảnh để pipeline (preview/cut-list/dedup) không vỡ.
    if not scenes:
        dur = 0.0
        try:
            dur = float(video.duration.seconds)
        except Exception:
            dur = 0.0
        scenes.append(Scene(index=0, start=0.0, end=dur, duration=dur))
        log.info("scene_detect_nocut_fallback", duration=dur)

    if thumbnails and scenes:
        _attach_thumbnails(str(path), scenes, thumb_width or cfg.scene_thumb_width)

    groups: list[SceneGroup] = []
    if group and scenes:
        groups = _group_scenes(
            str(path), scenes, group_threshold or cfg.scene_group_threshold
        )

    log.info(
        "scene_detect_done", detector=det, count=len(scenes), groups=len(groups)
    )
    return SceneResult(
        media_path=str(path),
        scenes=scenes,
        detector=det,
        fps=float(fps),
        groups=groups,
    )

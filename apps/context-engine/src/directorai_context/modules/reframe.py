"""A1 — Reframe: crop/zoom HƯỚNG VỀ CHỦ THỂ (YOLO) thay vì giữa khung.

Lấy mẫu vài frame → YOLO detect (ưu tiên 'person') → tâm chủ thể trung bình →
recut_render đặt cửa sổ crop quanh tâm đó (giữ nhân vật trong khung khi zoom-crop
chống-trùng). Lỗi/không thấy chủ thể → trả None (recut_render fallback crop giữa).
"""

from __future__ import annotations

from pathlib import Path

from directorai_context.logger import log

_MODEL = None


def _get_model(model_path: str = "yolov8n.pt"):
    """Nạp YOLO 1 lần (model nhỏ ~6MB, tự tải lần đầu)."""
    global _MODEL
    if _MODEL is None:
        from ultralytics import YOLO

        _MODEL = YOLO(model_path)
    return _MODEL


def subject_center(
    video_path: str, samples: int = 5, model_path: str = "yolov8n.pt"
) -> tuple[float, float] | None:
    """Trả (cx, cy) chuẩn-hoá [0,1] = tâm chủ thể trung bình; None nếu không thấy."""
    if not Path(video_path).exists():
        return None
    try:
        import cv2
        import numpy as np
    except Exception as e:  # pragma: no cover
        log.warning("reframe_no_cv2", error=str(e))
        return None
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        w = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1.0
        h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1.0
        if total <= 0:
            return None
        model = _get_model(model_path)
        idxs = [int(total * (k + 1) / (samples + 1)) for k in range(samples)]
        cxs: list[float] = []
        cys: list[float] = []
        for idx in idxs:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            try:
                res = model.predict(frame, verbose=False, conf=0.35)
            except Exception as e:  # 1 frame lỗi không làm hỏng cả lượt
                log.warning("reframe_predict_fail", error=str(e))
                continue
            boxes = res[0].boxes if res else None
            if boxes is None or len(boxes) == 0:
                continue
            xywh = boxes.xywh.cpu().numpy()  # cx, cy, w, h (pixel)
            cls = boxes.cls.cpu().numpy()
            persons = xywh[cls == 0]  # class 0 = person
            pick = persons if len(persons) else xywh
            areas = pick[:, 2] * pick[:, 3]
            b = pick[int(np.argmax(areas))]
            cxs.append(float(b[0]) / float(w))
            cys.append(float(b[1]) / float(h))
        if not cxs:
            return None
        center = (sum(cxs) / len(cxs), sum(cys) / len(cys))
        log.info("reframe_center", cx=round(center[0], 3), cy=round(center[1], 3), frames=len(cxs))
        return center
    finally:
        cap.release()

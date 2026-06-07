"""A3 — Gán NHÃN ngữ-nghĩa cho từng nhóm cảnh (Gemini Vision).

Bổ sung cho gom cảnh CV (``scene._group_scenes`` — gom shot kề nhau giống nhau
theo histogram màu). CV biết "đây là cùng 1 bối cảnh" nhưng KHÔNG biết "bối cảnh
đó là gì". A3 lấy 1 khung đại diện mỗi nhóm → gửi Gemini Vision trong MỘT lần
gọi đa-ảnh → mỗi nhóm nhận 1 nhãn ngắn tiếng Việt (vd "phục kích", "nạp đạn",
"ăn mừng"). Mọi lỗi đều nuốt: nhãn là tuỳ chọn, không được làm hỏng detect.

Chi phí: 1 request / lần detect (không phải 1/nhóm). Cap số nhóm gắn nhãn để
payload không phình khi video có quá nhiều nhóm.
"""

from __future__ import annotations

import base64
import json

from directorai_context.logger import log
from directorai_context.models import Scene, SceneGroup

# Cap số nhóm gửi Gemini (mỗi nhóm 1 ảnh). Quá ngưỡng → chỉ gắn nhãn N nhóm đầu.
_MAX_GROUPS = 16

_PROMPT = """Bạn là editor video hành động (thường là bắn súng Nerf, thể thao
ngoài trời). Tôi gửi cho bạn MỘT khung đại diện cho MỖI cảnh, theo đúng thứ tự.

Nhiệm vụ: đặt cho mỗi cảnh một NHÃN ngắn tiếng Việt (2-4 từ) mô tả cảnh đó đang
xảy ra gì — ví dụ: "phục kích", "đấu súng cự ly gần", "nạp đạn", "rút lui",
"ăn mừng chiến thắng", "thiết lập đội hình". Ngắn gọn, dễ hiểu, KHÔNG giải thích.

Trả về JSON ĐÚNG schema (không thêm chữ ngoài JSON), labels theo ĐÚNG thứ tự ảnh:
{ "labels": ["nhãn cảnh 1", "nhãn cảnh 2", ...] }"""


def _rep_frame_jpeg(media_path: str, scene: Scene, width: int = 320) -> bytes | None:
    """Trích khung GIỮA của 1 shot đại diện → JPEG bytes (None nếu lỗi)."""
    try:
        import cv2
    except Exception as e:  # pragma: no cover
        log.warning("scene_semantic_no_cv2", error=str(e))
        return None
    cap = cv2.VideoCapture(media_path)
    if not cap.isOpened():
        return None
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        cap.set(cv2.CAP_PROP_POS_FRAMES, int((scene.start + scene.end) / 2.0 * fps))
        ok, frame = cap.read()
        if not ok or frame is None:
            return None
        h, w = frame.shape[:2]
        if w > width and w > 0:
            new_h = max(1, round(h * width / w))
            frame = cv2.resize(frame, (width, new_h), interpolation=cv2.INTER_AREA)
        ok2, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        return buf.tobytes() if ok2 else None
    finally:
        cap.release()


def _gemini_labels(jpegs: list[bytes], model: str, api_key: str) -> list[str]:
    """Gửi nhiều ảnh + prompt → list nhãn theo đúng thứ tự ảnh."""
    import httpx

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    parts: list[dict] = [{"text": _PROMPT}]
    for jpg in jpegs:
        parts.append(
            {
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": base64.b64encode(jpg).decode("ascii"),
                }
            }
        )
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json",
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(url, json=body)
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini HTTP {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    cand = (data.get("candidates") or [{}])[0]
    text = (cand.get("content", {}).get("parts", [{}]) or [{}])[0].get("text", "")
    if not text:
        raise RuntimeError(f"Gemini empty (finish={cand.get('finishReason')})")
    parsed = json.loads(text)
    labels = parsed.get("labels") if isinstance(parsed, dict) else None
    if not isinstance(labels, list):
        raise RuntimeError("Gemini trả thiếu mảng 'labels'")
    return [str(x) for x in labels]


def label_groups(
    media_path: str,
    groups: list[SceneGroup],
    scenes: list[Scene],
    model: str,
    api_key: str,
) -> None:
    """Gán ``group.label`` cho từng nhóm (in-place). Lỗi → bỏ qua, không raise."""
    if not groups or not api_key:
        return
    targets = groups[:_MAX_GROUPS]
    if len(groups) > _MAX_GROUPS:
        log.info("scene_semantic_capped", total=len(groups), labeled=_MAX_GROUPS)

    jpegs: list[bytes] = []
    kept: list[SceneGroup] = []
    for g in targets:
        # shot đại diện = shot giữa nhóm (ổn định hơn shot đầu/cuối).
        rep_idx = g.shot_indices[len(g.shot_indices) // 2]
        if rep_idx < 0 or rep_idx >= len(scenes):
            continue
        jpg = _rep_frame_jpeg(media_path, scenes[rep_idx])
        if jpg:
            jpegs.append(jpg)
            kept.append(g)
    if not jpegs:
        return

    try:
        labels = _gemini_labels(jpegs, model, api_key)
    except Exception as e:
        log.warning("scene_semantic_fail", error=str(e))
        return

    for g, lab in zip(kept, labels, strict=False):
        lab = (lab or "").strip()
        if lab:
            g.label = lab
    log.info("scene_semantic_done", labeled=sum(1 for g in kept if g.label))

"""AI-1 — Hiểu ngữ nghĩa clip bằng Gemini Vision.

Khác `vision.py` (chỉ caption/tag từng frame), module này HIỂU clip như
một editor: nội dung đang xảy ra, có phải khoảnh khắc đắt giá, blur do
action hay do lỗi, nên giữ hay bỏ — KÈM LÝ DO.

Đây là Tầng 2 trong kiến trúc ai-understanding.md: biến "số" (CV) thành
"ý nghĩa".

Cost: gửi N frame/clip (mặc định 3) tới Gemini Vision. Dùng model flash
cho rẻ + nhanh.
"""

from __future__ import annotations

import base64
import contextlib
import hashlib
import json
from pathlib import Path

import httpx

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.modules.frame_sampler import sample as sample_frames

# Tăng khi đổi prompt/schema để vô hiệu cache cũ.
_CACHE_VERSION = "v1"


def _cache_key(path: Path, frames: int, model: str) -> str:
    """Key cache theo nội dung file (size+mtime) + tham số → không trả phí
    Gemini Vision lặp lại cho cùng 1 clip."""
    try:
        st = path.stat()
        sig = f"{path.resolve()}|{st.st_size}|{int(st.st_mtime)}|{frames}|{model}|{_CACHE_VERSION}"
    except OSError:
        sig = f"{path}|{frames}|{model}|{_CACHE_VERSION}"
    return hashlib.sha1(sig.encode("utf-8")).hexdigest()


def _cache_path(key: str) -> Path:
    d = get_settings().cache_dir / "vision"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{key}.json"

# Prompt hệ thống — hướng dẫn Gemini hiểu như editor video hành động Nerf.
_PROMPT = """Bạn là một editor video chuyên nghiệp đang xem các khung hình
trích từ MỘT clip trong dự án video hành động (thường là bắn súng Nerf,
thể thao, hoặc hành động ngoài trời).

Nhiệm vụ: XEM các khung hình và HIỂU clip này, trả về JSON đúng schema.

QUAN TRỌNG về chất lượng — đừng đánh giá máy móc:
- Blur (mờ nhòe) do CHUYỂN ĐỘNG NHANH (nhân vật đang bắn, né, chạy) là
  BÌNH THƯỜNG và thường là khoảnh khắc ĐẮT GIÁ → giữ lại (keep).
- Chỉ đánh "discard" khi clip HỎNG THẬT: rung tay quá mạnh không nhìn được
  gì, lia máy trượt hoàn toàn, che ống kính, tối đen vô nghĩa, hoặc nội
  dung trống rỗng (đứng yên không có gì xảy ra quá lâu).
- "review" khi không chắc, để người dùng tự quyết.

Trả về JSON THEO ĐÚNG schema (không thêm chữ ngoài JSON):
{
  "summary": "mô tả ngắn bằng tiếng Việt clip đang xảy ra gì",
  "scene_type": "action" | "setup" | "reaction" | "establishing" | "transition" | "dialogue" | "static",
  "action_level": 0-10,
  "is_key_moment": true | false,
  "key_moment_type": "hit" | "dodge" | "aim" | "pose" | "reaction" | "celebration" | null,
  "subjects": ["chủ thể chính trong khung"],
  "blur_assessment": "sharp" | "soft" | "action-blur" | "shake-error",
  "quality_verdict": "keep" | "review" | "discard",
  "quality_reason": "lý do tiếng Việt vì sao giữ/xem lại/bỏ",
  "emotion": "tense" | "fun" | "intense" | "calm" | "neutral",
  "confidence": 0.0-1.0
}"""


def _gemini_vision_request(jpeg_frames: list[bytes], model: str, api_key: str) -> dict:
    """Gọi Gemini Vision với nhiều frame + prompt, trả JSON đã parse."""
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    parts: list[dict] = [{"text": _PROMPT}]
    for jpg in jpeg_frames:
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
            "temperature": 0.2,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
            # Gemini 2.5 Flash bật "thinking" mặc định → token suy nghĩ ăn hết
            # budget làm JSON bị cắt ("Unterminated string"). Tắt hẳn cho tác
            # vụ structured ngắn này: nhanh + ổn định + rẻ hơn.
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(url, json=body)
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini Vision HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        block = data.get("promptFeedback", {}).get("blockReason")
        raise RuntimeError(f"Gemini Vision no candidates (block={block})")
    cand = candidates[0]
    text = (cand.get("content", {}).get("parts", [{}]) or [{}])[0].get("text", "")
    if not text:
        finish = cand.get("finishReason")
        raise RuntimeError(f"Gemini Vision empty text (finishReason={finish})")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        finish = cand.get("finishReason")
        raise RuntimeError(
            f"Gemini Vision JSON lỗi (finishReason={finish}, len={len(text)}): "
            f"{e} — đầu chuỗi: {text[:160]!r}"
        ) from e


def understand_clip(
    media_path: str, frames: int | None = None, *, use_cache: bool = True
) -> dict:
    """Hiểu 1 clip: sample frame → Gemini Vision → ClipUnderstanding dict.

    Trả về dict gồm media_path + các trường hiểu biết (xem _PROMPT schema).
    Có cache theo nội dung file: lần 2 trở đi trả ngay, không gọi Gemini.
    """
    cfg = get_settings()
    if not cfg.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY chưa được cấu hình cho sidecar")

    path = Path(media_path)
    if not path.exists():
        raise FileNotFoundError(f"Media not found: {media_path}")

    n = frames or cfg.vision_frames_per_clip
    model = cfg.gemini_vision_model

    if use_cache:
        cp = _cache_path(_cache_key(path, n, model))
        if cp.exists():
            try:
                cached = json.loads(cp.read_text(encoding="utf-8"))
                cached["_cached"] = True
                log.info("vision_understand_cache_hit", media=str(path))
                return cached
            except (OSError, json.JSONDecodeError):
                pass  # cache hỏng → tính lại

    log.info("vision_understand_start", media=str(path), frames=n)

    sampled = sample_frames(str(path), count=n, max_dim=768)
    if not sampled:
        raise RuntimeError(f"Không trích được frame nào từ {media_path}")
    jpegs = [f.to_jpeg(quality=80) for f in sampled]

    result = _gemini_vision_request(jpegs, model, cfg.gemini_api_key)
    result["media_path"] = str(path)
    result["frames_used"] = len(jpegs)

    if use_cache:
        with contextlib.suppress(OSError):  # ghi cache lỗi không chặn kết quả
            _cache_path(_cache_key(path, n, model)).write_text(
                json.dumps(result, ensure_ascii=False), encoding="utf-8"
            )

    result["_cached"] = False
    log.info(
        "vision_understand_done",
        media=str(path),
        verdict=result.get("quality_verdict"),
        scene=result.get("scene_type"),
        key=result.get("is_key_moment"),
    )
    return result

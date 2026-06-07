"""AI-2 — Bản đồ video (Tầng 3).

Nhận hiểu-biết-từng-clip (output AI-1) và GỘP lại như một editor đọc toàn
bộ rushes: cốt truyện, phân đoạn, cao trào, clip trùng/thừa, thứ tự lắp
ráp gợi ý. Biến "hiểu từng mảnh" → "hiểu tổng thể".

Đây là Tầng 3 trong ai-understanding.md. Không tự xoá gì — chỉ ĐỀ XUẤT,
mọi quyết định cuối qua bạn duyệt (Tầng an toàn).
"""

from __future__ import annotations

import json

import httpx

from directorai_context.config import get_settings
from directorai_context.logger import log

_PROMPT = """Bạn là một editor video chuyên nghiệp đang đọc bảng phân tích
TỪNG clip của một dự án video hành động (thường là bắn súng Nerf, cosplay,
thể thao hành động). Mỗi dòng là hiểu-biết về 1 clip: nội dung, loại cảnh,
mức action, khoảnh khắc đắt giá, chất lượng.

Nhiệm vụ: GỘP toàn bộ thành một BẢN ĐỒ VIDEO tổng thể — như khi bạn nhìn
hết rushes và lên kế hoạch dựng. Hãy suy nghĩ như người dựng phim:
- Cốt truyện/diễn biến chung là gì? Mở đầu → cao trào → kết.
- Gom clip thành các PHÂN ĐOẠN có mục đích (giới thiệu, dồn nén, bùng nổ...).
- Đâu là KHOẢNH KHẮC ĐẮT cần nhấn (cú trúng đạn, pha né, tạo dáng đẹp).
- Clip nào TRÙNG nội dung / thừa, có thể bỏ bớt (nêu rõ vì sao, GIỮ cái nào).
- Gợi ý THỨ TỰ lắp ráp hợp lý.
KHÔNG bịa clip không có trong danh sách. Chỉ dùng đúng media_path đã cho.

MỤC TIÊU NGƯỜI DÙNG (nếu có): {goal}

Trả về JSON THEO ĐÚNG schema (không thêm chữ ngoài JSON), tiếng Việt:
{
  "title_suggestion": "tên gợi ý cho video",
  "overall_summary": "tóm tắt toàn bộ nội dung 2-4 câu",
  "story_arc": "mô tả diễn biến: mở đầu → phát triển → cao trào → kết",
  "segments": [
    {
      "name": "tên phân đoạn",
      "purpose": "establishing|buildup|action|climax|resolution|comedy|transition",
      "clip_paths": ["media_path các clip thuộc đoạn này"],
      "description": "mô tả ngắn phân đoạn"
    }
  ],
  "key_moments": [
    {
      "clip_path": "media_path",
      "type": "hit|dodge|aim|pose|reaction|celebration",
      "why": "vì sao đắt giá",
      "suggested_emphasis": "slow-mo|giữ-lâu|cắt-cận|nhạc-nhấn|none"
    }
  ],
  "duplicates": [
    {
      "clip_paths": ["các clip trùng nội dung"],
      "reason": "vì sao coi là trùng",
      "keep_suggestion": "media_path nên giữ"
    }
  ],
  "discard_candidates": ["media_path nên cân nhắc bỏ (kèm trong editorial_notes lý do)"],
  "assembly_suggestion": ["media_path theo thứ tự lắp ráp gợi ý"],
  "quality_summary": {"keep": 0, "review": 0, "discard": 0},
  "editorial_notes": "ghi chú cho editor: nhịp, nhạc, điểm cần lưu ý",
  "confidence": 0.0
}"""


def _compact_understanding(u: dict, idx: int) -> dict:
    """Rút gọn 1 understanding để tiết kiệm token khi gộp."""
    return {
        "i": idx,
        "media_path": u.get("media_path"),
        "summary": u.get("summary"),
        "scene_type": u.get("scene_type"),
        "action_level": u.get("action_level"),
        "is_key_moment": u.get("is_key_moment"),
        "key_moment_type": u.get("key_moment_type"),
        "subjects": u.get("subjects"),
        "blur": u.get("blur_assessment"),
        "verdict": u.get("quality_verdict"),
        "emotion": u.get("emotion"),
    }


def _gemini_text_request(prompt: str, payload: str, model: str, api_key: str) -> dict:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    body = {
        "contents": [
            {"role": "user", "parts": [{"text": prompt}, {"text": payload}]}
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    with httpx.Client(timeout=90.0) as client:
        resp = client.post(url, json=body)
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini text HTTP {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        block = data.get("promptFeedback", {}).get("blockReason")
        raise RuntimeError(f"Gemini text no candidates (block={block})")
    cand = candidates[0]
    text = (cand.get("content", {}).get("parts", [{}]) or [{}])[0].get("text", "")
    if not text:
        raise RuntimeError(f"Gemini text empty (finishReason={cand.get('finishReason')})")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"Gemini text JSON lỗi (finishReason={cand.get('finishReason')}, "
            f"len={len(text)}): {e}"
        ) from e


def build_video_map(understandings: list[dict], goal: str | None = None) -> dict:
    """Gộp list clip-understanding → bản đồ video tổng (Tầng 3).

    `understandings`: list dict từ AI-1 (mỗi clip 1 dict). `goal`: mục tiêu
    edit của người dùng (vd "làm trailer 60s gay cấn") — tuỳ chọn.
    """
    cfg = get_settings()
    if not cfg.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY chưa được cấu hình cho sidecar")
    if not understandings:
        raise ValueError("understandings rỗng — không có gì để gộp")

    compact = [_compact_understanding(u, i) for i, u in enumerate(understandings)]
    payload = "DANH SÁCH CLIP:\n" + json.dumps(compact, ensure_ascii=False)
    prompt = _PROMPT.replace("{goal}", goal or "(không có — tự đề xuất hợp lý)")

    log.info("video_map_start", clips=len(understandings), goal=goal)
    result = _gemini_text_request(
        prompt, payload, cfg.gemini_text_model, cfg.gemini_api_key
    )

    # Bổ sung quality_summary chính xác từ dữ liệu thật (không tin LLM đếm).
    verdicts = [u.get("quality_verdict") for u in understandings]
    result["quality_summary"] = {
        "keep": verdicts.count("keep"),
        "review": verdicts.count("review"),
        "discard": verdicts.count("discard"),
    }
    result["total_clips"] = len(understandings)

    log.info(
        "video_map_done",
        clips=len(understandings),
        segments=len(result.get("segments", [])),
        key_moments=len(result.get("key_moments", [])),
    )
    return result

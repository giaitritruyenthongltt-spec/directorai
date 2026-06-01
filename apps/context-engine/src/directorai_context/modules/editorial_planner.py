"""AI-3 — Editorial planner (Tầng 4).

Cầu nối "HIỂU → HÀNH ĐỘNG": nhận bản đồ video (AI-2) + mục tiêu của người
dùng → KẾ HOẠCH edit có lý do. Mỗi bước:
- CHỈ dùng thao tác đã verify ghi được trên Premiere 26
  (disable / trim / move / rename / transition).
- KHÔNG bịa thao tác chưa ghi được (split / speed / insert / marker) —
  liệt kê riêng vào `out_of_scope` để minh bạch.
- Có lý do (gắn với hiểu-biết nội dung) + reversible.

Kế hoạch này KHÔNG tự chạy. Nó đi vào Tầng an toàn (SAFE-1): preview →
bạn duyệt → ghi không phá hủy → undo được.
"""

from __future__ import annotations

import json

import httpx

from directorai_context.config import get_settings
from directorai_context.logger import log

# Thao tác đã verify GHI ĐƯỢC trên Premiere 26 (Track A — executeTransaction).
SAFE_ACTIONS = ("disable", "trim", "move", "rename", "transition")
# Thao tác CHƯA ghi được (cần FCPXML) — không cho phép trong kế hoạch.
OUT_OF_SCOPE_ACTIONS = ("split", "speed", "insert", "marker")

_PROMPT = """Bạn là một đạo diễn dựng phim (editor) đang lập KẾ HOẠCH dựng
cho một dự án video hành động Nerf, dựa trên BẢN ĐỒ VIDEO đã phân tích.

MỤC TIÊU NGƯỜI DÙNG: {goal}

RÀNG BUỘC KỸ THUẬT TUYỆT ĐỐI (Premiere 26 qua plugin):
- CHỈ được dùng các thao tác sau (đã chứng minh ghi được, hoàn tác được):
  - "disable": tắt/ẩn 1 clip khỏi bản dựng (KHÔNG xoá file) — dùng để loại
    clip hỏng/trùng/thừa.
  - "trim": tỉa in/out 1 clip (cắt bớt đầu/cuối) — dùng bỏ phần thừa, khoảng lặng.
  - "move": đổi vị trí clip trên timeline — dùng sắp lại theo cốt truyện.
  - "rename": đổi tên clip theo cảnh/nội dung — dùng để dễ quản lý.
  - "transition": thêm chuyển cảnh giữa 2 clip.
- TUYỆT ĐỐI KHÔNG dùng: cắt-đôi (split), đổi tốc độ (speed/slow-mo),
  chèn clip mới (insert), marker — Premiere 26 CHƯA cho plugin ghi các
  thao tác này. Nếu mục tiêu cần chúng, ghi vào "out_of_scope" + nêu rõ
  cần xuất FCPXML, KHÔNG đưa thành step.
- Mỗi bước phải gắn với 1 clip CÓ THẬT trong bản đồ (dùng đúng media_path).
- Ưu tiên AN TOÀN: thà "disable" (ẩn, hoàn tác được) hơn là đề xuất xoá.

Hãy suy nghĩ như editor: phục vụ mục tiêu, giữ khoảnh khắc đắt, bỏ clip
trùng/hỏng, sắp theo cốt truyện. GIẢI THÍCH vì sao cho từng bước.

Trả về JSON THEO ĐÚNG schema (không thêm chữ ngoài JSON), tiếng Việt:
{
  "goal_understanding": "diễn giải lại mục tiêu bạn hiểu",
  "strategy": "chiến lược tổng 2-4 câu",
  "steps": [
    {
      "order": 1,
      "action": "disable|trim|move|rename|transition",
      "target_path": "media_path clip mục tiêu",
      "params": { "ví dụ trim": "in_sec/out_sec", "ví dụ move": "to_index",
                  "ví dụ rename": "new_name", "ví dụ transition": "kind/duration_sec" },
      "reason": "vì sao làm bước này (gắn nội dung clip)",
      "reversible": true
    }
  ],
  "out_of_scope": [
    { "want": "điều muốn làm nhưng chưa ghi được", "needs": "FCPXML/khác", "why": "..." }
  ],
  "estimated_impact": "tóm tắt thay đổi tổng thể sau khi áp dụng",
  "requires_preview": true,
  "confidence": 0.0
}"""


def _gemini_text_request(prompt: str, payload: str, model: str, api_key: str) -> dict:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}, {"text": payload}]}],
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
            f"Gemini text JSON lỗi (finishReason={cand.get('finishReason')}): {e}"
        ) from e


def _sanitize_plan(plan: dict) -> dict:
    """Bảo hiểm cuối: loại mọi step dùng thao tác chưa ghi được, dù prompt
    đã cấm. Step bị loại → chuyển sang out_of_scope để minh bạch."""
    steps = plan.get("steps") or []
    kept: list[dict] = []
    rejected: list[dict] = []
    for s in steps:
        action = str(s.get("action", "")).lower().strip()
        if action in SAFE_ACTIONS:
            s["action"] = action
            s["reversible"] = True
            kept.append(s)
        else:
            rejected.append(s)
    plan["steps"] = kept
    if rejected:
        oos = plan.get("out_of_scope") or []
        for r in rejected:
            oos.append(
                {
                    "want": f"{r.get('action')} trên {r.get('target_path')}",
                    "needs": "FCPXML (Premiere 26 chưa cho plugin ghi)",
                    "why": r.get("reason", ""),
                }
            )
        plan["out_of_scope"] = oos
        log.info("edit_plan_sanitized", rejected=len(rejected))
    # luôn bắt buộc preview
    plan["requires_preview"] = True
    plan["rejected_unsafe_steps"] = len(rejected)
    return plan


def build_edit_plan(video_map: dict, goal: str) -> dict:
    """Lập kế hoạch edit từ bản đồ video + mục tiêu. Chỉ chứa safe ops.

    `video_map`: output AI-2 (build_video_map). `goal`: mục tiêu edit của
    người dùng (vd "làm bản dựng 60s gay cấn, bỏ clip trùng").
    """
    cfg = get_settings()
    if not cfg.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY chưa được cấu hình cho sidecar")
    if not video_map:
        raise ValueError("video_map rỗng")
    if not goal or not goal.strip():
        raise ValueError("goal rỗng — cần mục tiêu edit")

    # Chỉ gửi các trường cần để tiết kiệm token.
    slim = {
        k: video_map.get(k)
        for k in (
            "title_suggestion",
            "overall_summary",
            "story_arc",
            "segments",
            "key_moments",
            "duplicates",
            "discard_candidates",
            "assembly_suggestion",
            "quality_summary",
        )
    }
    payload = "BẢN ĐỒ VIDEO:\n" + json.dumps(slim, ensure_ascii=False)
    prompt = _PROMPT.replace("{goal}", goal.strip())

    log.info("edit_plan_start", goal=goal, segments=len(slim.get("segments") or []))
    plan = _gemini_text_request(prompt, payload, cfg.gemini_text_model, cfg.gemini_api_key)
    plan = _sanitize_plan(plan)

    log.info(
        "edit_plan_done",
        steps=len(plan.get("steps", [])),
        out_of_scope=len(plan.get("out_of_scope", [])),
        rejected=plan.get("rejected_unsafe_steps", 0),
    )
    return plan

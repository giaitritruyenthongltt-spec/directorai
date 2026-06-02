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

_PROMPT = """Bạn là một ĐẠO DIỄN DỰNG PHIM (film editor) đang lập KẾ HOẠCH
dựng một BỘ PHIM NERF CÓ CỐT TRUYỆN (không phải montage ngắn), dựa trên
BẢN ĐỒ VIDEO đã phân tích. Tư duy như dựng phim dài: có CẤU TRÚC, có MẠCH,
giữ năng lượng qua nhiều phút, không cắt vụn theo từng giây.

MỤC TIÊU NGƯỜI DÙNG: {goal}
{longform}
TƯ DUY ĐIỆN ẢNH (bắt buộc):
- Chia phim thành CHƯƠNG (act/chapter) có mục đích tự sự rõ: mở đầu (setup) →
  dồn nén/đối đầu (buildup, action, climax) → giải quyết (resolution, outro).
- Trong mỗi chương, giữ KHOẢNH KHẮC ĐẮT (trúng đạn/né/ngắm/ăn mừng), bỏ
  khoảng chờ/nạp đạn/khoảng lặng thừa, nhưng GIỮ nhịp thở tự nhiên — đừng cắt
  sát đến mức ngộp.
- Giữ MẠCH NHÂN VẬT: nếu một nhân vật xuất hiện, đảm bảo đủ thời lượng để khán
  giả nhận ra và theo dõi.
- Nhịp BIẾN ĐỔI theo chương (build → cao trào → lắng), không đều đều.

RÀNG BUỘC KỸ THUẬT TUYỆT ĐỐI (Premiere 26 qua plugin):
- CHỈ được dùng các thao tác sau (đã chứng minh ghi được, hoàn tác được):
  - "disable": tắt/ẩn 1 clip khỏi bản dựng (KHÔNG xoá file) — loại clip
    hỏng/trùng/thừa hoặc clip không phục vụ chương nào.
  - "trim": tỉa in/out 1 clip — bỏ phần thừa, khoảng lặng/dead-air đầu/cuối.
  - "move": đổi vị trí clip trên timeline — sắp theo chương + cốt truyện.
  - "rename": đổi tên clip theo cảnh/chương — dễ quản lý.
  - "transition": thêm chuyển cảnh giữa 2 clip (ghép chương mượt).
- TUYỆT ĐỐI KHÔNG dùng: cắt-đôi (split), đổi tốc độ (speed/slow-mo),
  chèn clip mới (insert), marker — Premiere 26 CHƯA cho plugin ghi. Nếu mục
  tiêu cần chúng, ghi vào "out_of_scope" (cần FCPXML), KHÔNG đưa thành step.
- Mỗi step gắn 1 clip CÓ THẬT trong bản đồ (đúng media_path).
- Ưu tiên AN TOÀN: thà "disable" (ẩn, hoàn tác được) hơn đề xuất xoá.

QUY TRÌNH: trước hết phác CHƯƠNG (chapters) + phân bổ clip vào chương theo thứ
tự kể chuyện; SAU ĐÓ sinh steps (safe ops) để hiện thực hoá cấu trúc đó.

Trả về JSON THEO ĐÚNG schema (không thêm chữ ngoài JSON), tiếng Việt:
{
  "goal_understanding": "diễn giải lại mục tiêu bạn hiểu",
  "strategy": "chiến lược dựng tổng thể 2-4 câu (nói rõ cấu trúc chương)",
  "chapters": [
    {
      "name": "Hồi 1 — Khởi đầu",
      "purpose": "intro|establishing|buildup|action|climax|resolution|outro",
      "pacing": "slow|balanced|fast|cinematic|build|wind_down",
      "target_duration_sec": 0,
      "clip_paths": ["media_path các clip thuộc chương, theo thứ tự kể"]
    }
  ],
  "steps": [
    {
      "order": 1,
      "action": "disable|trim|move|rename|transition",
      "target_path": "media_path clip mục tiêu",
      "params": { "ví dụ trim": "in_sec/out_sec", "ví dụ move": "to_index",
                  "ví dụ rename": "new_name", "ví dụ transition": "kind/duration_sec" },
      "reason": "vì sao làm bước này (gắn nội dung clip + chương)",
      "reversible": true
    }
  ],
  "out_of_scope": [
    { "want": "điều muốn làm nhưng chưa ghi được", "needs": "FCPXML/khác", "why": "..." }
  ],
  "total_target_duration_sec": 0,
  "estimated_kept_clips": 0,
  "estimated_impact": "tóm tắt thay đổi tổng thể sau khi áp dụng",
  "requires_preview": true,
  "confidence": 0.0
}"""


def _fmt_duration(sec: float) -> str:
    m, s = int(sec // 60), int(sec % 60)
    return f"{m} phút {s:02d} giây ({int(sec)}s)" if m else f"{int(sec)} giây"


_STRUCTURE_HINTS = {
    "3act": (
        "- CẤU TRÚC 3 HỒI: Hồi 1 thiết lập (nhân vật/bối cảnh), Hồi 2 đối đầu "
        "(cao trào hành động), Hồi 3 giải quyết (kết + ăn mừng). Phân bổ ~25%/"
        "50%/25% thời lượng."
    ),
    "chapters": (
        "- CHIA CHƯƠNG tự nhiên theo mạch sự kiện; mỗi chương 1 mục đích rõ, có "
        "mở-đỉnh-lắng riêng."
    ),
    "recap": (
        "- DẠNG RECAP TRẬN: chia theo HIỆP/VÒNG đấu; mỗi hiệp là 1 chương, giữ "
        "pha quyết định (loại/ghi điểm), bỏ đoạn chờ giữa hiệp."
    ),
}


def _longform_directive(
    target_duration_sec: float | None,
    keep_ratio: float | None,
    pacing_profile: str | None,
    structure: str | None,
) -> str:
    """LF1 — Khối chỉ thị long-form sinh từ tham số. Rỗng nếu không có tham số
    nào (giữ nguyên hành vi cũ cho short-form)."""
    if not any([target_duration_sec, keep_ratio, pacing_profile, structure]):
        return ""
    lines = ["", "ĐỊNH HƯỚNG PHIM DÀI (ưu tiên cao):"]
    if target_duration_sec and target_duration_sec > 0:
        lines.append(
            f"- THỜI LƯỢNG MỤC TIÊU bản dựng: ~{_fmt_duration(target_duration_sec)}. "
            f"Lập kế hoạch để tổng thời lượng GIỮ LẠI xấp xỉ con số này; phân bổ "
            f"thời lượng cho từng chương cộng lại ≈ mục tiêu."
        )
    if keep_ratio and 0 < keep_ratio <= 1:
        lines.append(
            f"- TỈ LỆ GIỮ LẠI mục tiêu: ~{int(keep_ratio * 100)}% clip (phần còn "
            f"lại disable/trim). Mạnh dạn loại clip thừa/trùng/yếu để đạt nhịp."
        )
    if pacing_profile:
        lines.append(f"- NHỊP tổng thể mong muốn: {pacing_profile}.")
    if structure and structure in _STRUCTURE_HINTS:
        lines.append(_STRUCTURE_HINTS[structure])
    return "\n".join(lines) + "\n"


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


def _valid_params(action: str, params: dict) -> tuple[bool, str]:
    """C6 — Kiểm tham số của 1 step (LLM có thể sinh bậy). Trả (hợp_lệ, lý_do)."""

    def _num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    if action == "trim":
        a, b = _num(params.get("in_sec")), _num(params.get("out_sec"))
        if a is None or b is None:
            return False, "trim thiếu in_sec/out_sec"
        if a < 0 or b <= a:
            return False, f"trim in/out không hợp lệ ({a}/{b})"
    elif action == "move":
        if _num(params.get("to_index")) is None:
            return False, "move thiếu to_index hợp lệ"
    elif action == "rename":
        if not str(params.get("new_name", "")).strip():
            return False, "rename thiếu new_name"
    elif action == "transition":
        if not str(params.get("kind", "")).strip():
            # không chặn — cho phép kind mặc định
            params["kind"] = "Cross Dissolve"
    return True, ""


def _sanitize_plan(plan: dict) -> dict:
    """Bảo hiểm cuối: loại mọi step dùng thao tác chưa ghi được HOẶC tham số
    bậy (C6). Step bị loại → chuyển sang out_of_scope để minh bạch."""
    steps = plan.get("steps")
    if not isinstance(steps, list):
        steps = []
    kept: list[dict] = []
    rejected: list[dict] = []
    bad_params: list[dict] = []
    for s in steps:
        if not isinstance(s, dict):
            continue
        action = str(s.get("action", "")).lower().strip()
        if action not in SAFE_ACTIONS:
            rejected.append(s)
            continue
        params = s.get("params") if isinstance(s.get("params"), dict) else {}
        ok, why = _valid_params(action, params)
        if not ok:
            s["_reject_reason"] = why
            bad_params.append(s)
            continue
        s["action"] = action
        s["params"] = params
        s["reversible"] = True
        kept.append(s)
    plan["steps"] = kept
    oos = plan.get("out_of_scope") or []
    for r in rejected:
        oos.append(
            {
                "want": f"{r.get('action')} trên {r.get('target_path')}",
                "needs": "FCPXML (Premiere 26 chưa cho plugin ghi)",
                "why": r.get("reason", ""),
            }
        )
    for r in bad_params:
        oos.append(
            {
                "want": f"{r.get('action')} trên {r.get('target_path')}",
                "needs": "tham số hợp lệ",
                "why": r.get("_reject_reason", "tham số không hợp lệ"),
            }
        )
    if rejected or bad_params:
        plan["out_of_scope"] = oos
        log.info("edit_plan_sanitized", rejected=len(rejected), bad_params=len(bad_params))
    # LF3 — chuẩn hóa lớp tự sự (chapters): chỉ mô tả, không thực thi nên
    # không có rủi ro an toàn; chỉ lọc rác để UI render gọn.
    plan["chapters"] = _sanitize_chapters(plan.get("chapters"))
    # luôn bắt buộc preview
    plan["requires_preview"] = True
    plan["rejected_unsafe_steps"] = len(rejected) + len(bad_params)
    return plan


_CHAPTER_PURPOSES = {
    "intro",
    "establishing",
    "buildup",
    "action",
    "climax",
    "resolution",
    "comedy",
    "transition",
    "outro",
}
_PACING_VALUES = {"slow", "balanced", "fast", "cinematic", "build", "wind_down"}


def _sanitize_chapters(chapters: object) -> list[dict]:
    """LF3 — Giữ các chương hợp lệ (có tên + ít nhất 1 clip), chuẩn hóa purpose/
    pacing về tập cho phép, ép target_duration_sec thành số."""
    if not isinstance(chapters, list):
        return []
    out: list[dict] = []
    for idx, ch in enumerate(chapters):
        if not isinstance(ch, dict):
            continue
        clip_paths = ch.get("clip_paths")
        clip_paths = (
            [str(p) for p in clip_paths if str(p).strip()] if isinstance(clip_paths, list) else []
        )
        # Chương không gom clip nào → rác, bỏ (UI chỉ render chương có nội dung).
        if not clip_paths:
            continue
        name = str(ch.get("name", "")).strip() or f"Chương {idx + 1}"
        purpose = str(ch.get("purpose", "")).lower().strip()
        if purpose == "setup":
            purpose = "establishing"
        if purpose not in _CHAPTER_PURPOSES:
            purpose = "action"
        pacing = str(ch.get("pacing", "")).lower().strip()
        if pacing not in _PACING_VALUES:
            pacing = "balanced"
        try:
            dur = float(ch.get("target_duration_sec") or 0)
        except (TypeError, ValueError):
            dur = 0.0
        out.append(
            {
                "name": name,
                "purpose": purpose,
                "pacing": pacing,
                "target_duration_sec": dur,
                "clip_paths": clip_paths,
            }
        )
    return out


def build_edit_plan(
    video_map: dict,
    goal: str,
    *,
    target_duration_sec: float | None = None,
    keep_ratio: float | None = None,
    pacing_profile: str | None = None,
    structure: str | None = None,
) -> dict:
    """Lập kế hoạch edit từ bản đồ video + mục tiêu. Chỉ chứa safe ops.

    `video_map`: output AI-2 (build_video_map). `goal`: mục tiêu edit.
    LF1 — tham số phim dài (optional, không truyền → hành vi short-form cũ):
      `target_duration_sec` thời lượng bản dựng mục tiêu; `keep_ratio` tỉ lệ
      giữ clip (0..1); `pacing_profile` nhịp tổng; `structure` 3act|chapters|recap.
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
    longform = _longform_directive(target_duration_sec, keep_ratio, pacing_profile, structure)
    prompt = _PROMPT.replace("{goal}", goal.strip()).replace("{longform}", longform)

    log.info(
        "edit_plan_start",
        goal=goal,
        segments=len(slim.get("segments") or []),
        target_sec=target_duration_sec,
        structure=structure,
    )
    plan = _gemini_text_request(prompt, payload, cfg.gemini_text_model, cfg.gemini_api_key)
    plan = _sanitize_plan(plan)

    log.info(
        "edit_plan_done",
        steps=len(plan.get("steps", [])),
        chapters=len(plan.get("chapters", [])),
        out_of_scope=len(plan.get("out_of_scope", [])),
        rejected=plan.get("rejected_unsafe_steps", 0),
    )
    return plan

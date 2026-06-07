"""A2 — Gợi ý THỨ TỰ dựng clip theo mạch phim (narrative arc).

Khác editorial_planner (lập kế hoạch CHI TIẾT trên 1 timeline có sẵn thứ tự),
A2 trả lời câu hỏi ĐẦU TIÊN: "nên xếp các clip rời theo thứ tự nào?". Dựa trên
hiểu-biết từng clip (AI-1 understand_clip — CÓ CACHE nên rẻ khi lặp): phân mỗi
clip vào 1 pha của mạch phim rồi sắp:

    mở màn (setup) → dồn nén (rising) → cao trào (climax) → kết (resolution)

Mỗi clip kèm LÝ DO ngắn. Lỗi hiểu 1 clip → coi là 'dồn nén' mức trung bình
(không làm hỏng cả gợi ý). KHÔNG ghi gì — chỉ trả thứ tự đề xuất.
"""

from __future__ import annotations

from directorai_context.logger import log

# Pha mạch phim: số nhỏ = đứng trước.
_PHASE_SETUP = 0
_PHASE_RISING = 1
_PHASE_CLIMAX = 2
_PHASE_END = 3

_PHASE_VI = {
    _PHASE_SETUP: "mở màn",
    _PHASE_RISING: "dồn nén",
    _PHASE_CLIMAX: "cao trào",
    _PHASE_END: "kết",
}


def _classify(u: dict) -> tuple[int, float, str]:
    """(phase, action_level, reason) cho 1 understanding clip."""
    scene = str(u.get("scene_type") or "").lower()
    action = float(u.get("action_level") or 0)
    is_key = bool(u.get("is_key_moment"))
    key_type = str(u.get("key_moment_type") or "").lower()
    summary = str(u.get("summary") or "").strip()

    # Kết = ăn mừng / phản ứng sau cao trào.
    if key_type == "celebration" or scene == "reaction":
        return _PHASE_END, action, "khoảnh khắc ăn mừng/phản ứng → đặt cuối"
    # Cao trào = key moment (trúng/né) hoặc action rất cao.
    if is_key or action >= 8:
        kt = key_type or "hành động đỉnh"
        return _PHASE_CLIMAX, action, f"cao trào ({kt}, action {action:.0f})"
    # Mở màn = thiết lập bối cảnh, ít hành động.
    if scene in ("establishing", "setup", "static", "dialogue", "transition"):
        return _PHASE_SETUP, action, f"thiết lập bối cảnh ({scene or 'setup'})"
    # Còn lại = dồn nén.
    tail = f" — {summary[:40]}" if summary else ""
    return _PHASE_RISING, action, f"đẩy nhịp (action {action:.0f}){tail}"


def suggest_order(clip_paths: list[str], goal: str | None = None) -> dict:
    """Trả {order:[{path,reason,phase,scene_type,action_level}], strategy, understood}."""
    from directorai_context.modules.vision_understand import understand_clip

    rows: list[dict] = []
    understood = 0
    for p in clip_paths:
        try:
            u = understand_clip(p)
            understood += 1
        except Exception as e:  # 1 clip lỗi không làm hỏng gợi ý
            log.warning("order_understand_fail", clip=p, error=str(e))
            u = {}
        phase, action, reason = _classify(u)
        rows.append(
            {
                "path": p,
                "reason": reason,
                "phase": phase,
                "phase_vi": _PHASE_VI[phase],
                "scene_type": u.get("scene_type"),
                "action_level": action,
                "_orig": len(rows),
            }
        )

    # Sắp: theo pha; trong cao trào tăng dần (đỉnh áp chót-kết); ổn định thứ tự gốc.
    rows.sort(key=lambda r: (r["phase"], r["action_level"], r["_orig"]))
    for i, r in enumerate(rows):
        r["position"] = i
        r.pop("_orig", None)

    n_setup = sum(1 for r in rows if r["phase"] == _PHASE_SETUP)
    n_climax = sum(1 for r in rows if r["phase"] == _PHASE_CLIMAX)
    n_end = sum(1 for r in rows if r["phase"] == _PHASE_END)
    strategy = (
        f"Sắp {len(rows)} clip theo mạch: {n_setup} mở màn → dồn nén → "
        f"{n_climax} cao trào → {n_end} kết. "
        + (f"Mục tiêu: {goal}" if goal else "")
    ).strip()
    log.info("order_suggest_done", clips=len(rows), understood=understood)
    return {"order": rows, "strategy": strategy, "understood": understood}

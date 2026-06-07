"""MOD-3 (B4) — CV-prefilter → Vision judge subset.

Triết lý tiết kiệm: CV thô (rẻ, không gọi Gemini) chấm CHẤT LƯỢNG hết clip,
chỉ những clip NGHI NGỜ kém mới đẩy lên Vision (Gemini) để HIỂU + quyết
định giữ/bỏ. Clip CV chấm tốt → tự giữ, không tốn Vision.

Đây là lớp "signals" (CV) + "judge" (Vision) của module "Lọc clip kém"
trong MASTER-ROADMAP §3.
"""

from __future__ import annotations

from directorai_context.logger import log
from directorai_context.modules.analyze_clip import analyze_clip


def _suspect_score(quality: dict) -> tuple[float, str]:
    """Trả (điểm nghi-ngờ-kém 0..1, lý do). Cao = nên xem kỹ bằng Vision."""
    composite = float(quality.get("composite", 0.5))
    blur = float(quality.get("blur", 0.5))
    # composite thấp → nghi. blur thấp (mờ) cũng nghi NHƯNG có thể là action-blur
    # → để Vision phân xử, đây chỉ là tín hiệu thô.
    suspect = 1.0 - composite
    reason = f"composite={composite:.2f}, blur={blur:.2f}"
    return round(suspect, 3), reason


def prefilter_clips(
    clip_paths: list[str], threshold: float = 0.5, sample_count: int = 4
) -> list[dict]:
    """CV chấm hết clip. Trả list {clip_path, composite, blur, suspect_score,
    is_suspect, reason}. is_suspect = composite < threshold."""
    out: list[dict] = []
    for path in clip_paths:
        try:
            res = analyze_clip(path, sample_count=sample_count).to_dict()
            quality = res.get("quality", {})
            composite = float(quality.get("composite", 0.5))
            blur = float(quality.get("blur", 0.5))
            score, reason = _suspect_score(quality)
            out.append(
                {
                    "clip_path": path,
                    "composite": round(composite, 3),
                    "blur": round(blur, 3),
                    "suspect_score": score,
                    "is_suspect": composite < threshold,
                    "reason": reason,
                }
            )
        except Exception as e:
            log.error("prefilter_clip_failed", media=path, error=str(e))
            # Lỗi đọc → coi là nghi để Vision xem (an toàn).
            out.append(
                {
                    "clip_path": path,
                    "composite": 0.0,
                    "blur": 0.0,
                    "suspect_score": 1.0,
                    "is_suspect": True,
                    "reason": f"CV lỗi: {e}",
                }
            )
    out.sort(key=lambda d: d["suspect_score"], reverse=True)
    return out


def filter_bad(
    clip_paths: list[str],
    threshold: float = 0.5,
    frames: int | None = None,
) -> dict:
    """Lọc clip kém kiểu signals→judge: CV chấm hết → Vision chỉ xem clip
    nghi → quyết định keep/review/discard. Clip CV tốt tự keep.

    Trả: keep/review/discard (mỗi cái list clip_path + lý do), thống kê chi
    phí (cv_scanned, vision_calls).
    """
    from directorai_context.modules.vision_understand import understand_clip

    prefiltered = prefilter_clips(clip_paths, threshold=threshold)
    keep: list[dict] = []
    review: list[dict] = []
    discard: list[dict] = []
    vision_calls = 0

    for p in prefiltered:
        path = p["clip_path"]
        if not p["is_suspect"]:
            keep.append({"clip_path": path, "reason": f"CV tốt ({p['reason']})", "by": "cv"})
            continue
        # Nghi ngờ → Vision phân xử (cache giúp lần 2 miễn phí).
        try:
            u = understand_clip(path, frames=frames)
            if not u.get("_cached"):
                vision_calls += 1
            verdict = u.get("quality_verdict", "review")
            item = {
                "clip_path": path,
                "reason": u.get("quality_reason", ""),
                "by": "vision",
                "blur_assessment": u.get("blur_assessment"),
            }
            if verdict == "discard":
                discard.append(item)
            elif verdict == "keep":
                keep.append(item)
            else:
                review.append(item)
        except Exception as e:
            log.error("filter_bad_vision_failed", media=path, error=str(e))
            review.append({"clip_path": path, "reason": f"Vision lỗi: {e}", "by": "error"})

    log.info(
        "filter_bad_done",
        cv_scanned=len(clip_paths),
        suspects=sum(1 for p in prefiltered if p["is_suspect"]),
        vision_calls=vision_calls,
        keep=len(keep),
        review=len(review),
        discard=len(discard),
    )
    return {
        "keep": keep,
        "review": review,
        "discard": discard,
        "cv_scanned": len(clip_paths),
        "suspects": sum(1 for p in prefiltered if p["is_suspect"]),
        "vision_calls": vision_calls,
        "prefilter": prefiltered,
    }

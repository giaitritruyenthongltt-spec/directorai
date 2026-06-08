"""SPEED P1 — Phân tích tín hiệu để QUYẾT tốc độ từng cảnh (CV, 0 token).

Mỗi clip (= 1 cảnh quay) → đo:
  * motion   = mean abs pixel-diff giữa frame kề (tái dùng scene_class._motion_score)
               → cảnh động (cao) nên slow-mo để thấy rõ; cảnh tĩnh (thấp) nên tua nhanh.
  * fps/duration/has_audio → fps-gate slow-mo + tính thời lượng sau retime.

KHÔNG quyết speed ở đây (đó là speed_plan/P2 — ngưỡng lấy từ PHÂN BỐ thật). P1 chỉ
ĐO + trả phân bố để calibrate. Vision (action_level) là tuỳ chọn ở tầng trên.
"""

from __future__ import annotations

from directorai_context.logger import log


def _motion_of(path: str, samples: int) -> tuple[float, int]:
    """(motion_score 0-1, số frame dùng). Lỗi → (0.0, 0)."""
    try:
        import cv2

        from directorai_context.modules.frame_sampler import sample as sample_frames
        from directorai_context.modules.scene_class import _motion_score
    except Exception as e:  # pragma: no cover
        log.warning("speed_no_cv2", error=str(e))
        return 0.0, 0
    frames = sample_frames(path, count=samples, max_dim=512)
    if len(frames) < 2:
        return 0.0, len(frames)
    grays = [cv2.cvtColor(f.image, cv2.COLOR_BGR2GRAY) for f in frames]
    return _motion_score(grays), len(grays)


def analyze_clip_speed(media_path: str, samples: int = 12) -> dict:
    """Trả tín hiệu speed của 1 clip (không quyết tốc độ)."""
    from directorai_context.modules.recut_pipeline import probe_media

    info = probe_media(media_path)
    motion, used = _motion_of(media_path, samples)
    return {
        "path": media_path,
        "motion": round(motion, 4),
        "fps": round(float(info.get("fps") or 0), 3),
        "duration": round(float(info.get("duration") or 0), 3),
        "has_audio": bool(info.get("has_audio")),
        "width": int(info.get("width") or 0),
        "height": int(info.get("height") or 0),
        "samples_used": used,
    }


def _pct(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    i = min(len(sorted_vals) - 1, max(0, round((p / 100.0) * (len(sorted_vals) - 1))))
    return sorted_vals[i]


def analyze_speed_batch(clip_paths: list[str], samples: int = 12) -> dict:
    """Phân tích nhiều clip + trả PHÂN BỐ motion (để calibrate ngưỡng P2)."""
    rows = []
    for p in clip_paths:
        try:
            rows.append(analyze_clip_speed(p, samples))
        except Exception as e:  # 1 clip lỗi không làm hỏng batch
            log.warning("speed_analyze_fail", clip=p, error=str(e))
            rows.append({"path": p, "error": str(e)})
    motions = sorted(r["motion"] for r in rows if "motion" in r)
    fpss = sorted(r["fps"] for r in rows if "fps" in r)
    dist = {
        "count": len(motions),
        "motion_min": motions[0] if motions else 0.0,
        "motion_p20": _pct(motions, 20),
        "motion_p50": _pct(motions, 50),
        "motion_p80": _pct(motions, 80),
        "motion_max": motions[-1] if motions else 0.0,
        "fps_min": fpss[0] if fpss else 0.0,
        "fps_max": fpss[-1] if fpss else 0.0,
    }
    log.info("speed_analyze_batch", clips=len(rows), **{k: dist[k] for k in ("motion_p20", "motion_p50", "motion_p80")})
    return {"clips": rows, "distribution": dist}

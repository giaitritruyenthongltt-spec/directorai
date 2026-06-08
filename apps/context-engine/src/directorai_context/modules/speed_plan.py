"""SPEED P2 — Engine QUYẾT tốc độ từng cảnh từ phân bố motion THẬT (CV, 0 token).

Input = output của speed_analyze (mỗi clip có motion/fps/duration). Engine KHÔNG
hardcode ngưỡng: nó lấy PERCENTILE của chính batch này (R3 đã đóng — motion clustered
hẹp 0.07-0.21 nên ngưỡng tương đối đúng hơn tuyệt đối) rồi gán speed + reason + confidence.

4 mode:
  * content     — cảnh động (motion ≥ p_hi) → slow-mo; cảnh tĩnh (≤ p_lo) → tua nhanh.
  * normalize   — chuẩn hoá chuyển động: speed = motion/target (động→chậm, tĩnh→nhanh).
  * music       — (đặt chỗ) đồng bộ nhịp; chưa có beat ở P2 → fallback content.
  * duration    — co/giãn ĐỀU để batch đạt target_duration (giữ thứ tự).

Bất biến an toàn:
  * clamp tất cả speed về [min_speed, max_speed] ⊂ [0.5, 2.0] (giới hạn atempo).
  * fps-gate: clip fps < smooth_fps KHÔNG được slow-mo mạnh (judder) → giới hạn ≥ slowmo_fps_floor.
  * clip lỗi (không motion) → speed 1.0, confidence 0.
"""

from __future__ import annotations

from directorai_context.logger import log

# Giới hạn cứng theo atempo (giữ pitch chỉ ổn 0.5-2.0).
_HARD_MIN = 0.5
_HARD_MAX = 2.0


def _pct(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    i = min(len(sorted_vals) - 1, max(0, round((p / 100.0) * (len(sorted_vals) - 1))))
    return sorted_vals[i]


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _map_range(x: float, x0: float, x1: float, y0: float, y1: float) -> float:
    """Nội suy tuyến tính x∈[x0,x1] → [y0,y1] (kẹp biên). x1==x0 → y0."""
    if abs(x1 - x0) < 1e-9:
        return y0
    t = _clamp((x - x0) / (x1 - x0), 0.0, 1.0)
    return y0 + t * (y1 - y0)


def _fps_gated_slowmo(speed: float, fps: float, smooth_fps: float, floor_speed: float) -> tuple[float, bool]:
    """Slow-mo trên footage fps thấp → judder. Nâng speed về floor_speed nếu cần.

    Trả (speed_đã_gate, có_bị_gate). VD 24fps muốn 0.5x (→12fps) bị nâng lên floor 0.8x.
    """
    if speed < 1.0 and fps > 0 and fps < smooth_fps and speed < floor_speed:
        return floor_speed, True
    return speed, False


def plan_clip_speed(
    clip: dict,
    p_lo: float,
    p_hi: float,
    *,
    mode: str = "content",
    min_speed: float = 0.5,
    max_speed: float = 2.0,
    slowmo_floor: float = 0.5,
    speedup_ceiling: float = 2.0,
    target_motion: float = 0.0,
    smooth_fps: float = 50.0,
    slowmo_fps_floor: float = 0.8,
) -> dict:
    """Quyết speed cho 1 clip đã đo. p_lo/p_hi = ngưỡng percentile của batch."""
    path = clip.get("path", "")
    if "motion" not in clip:  # clip lỗi ở P1
        return {
            "path": path,
            "speed": 1.0,
            "reason": "lỗi phân tích → giữ 1.0x",
            "confidence": 0.0,
            "motion": None,
            "fps": clip.get("fps", 0.0),
            "category": "error",
            "fps_gated": False,
            "in_duration": clip.get("duration"),
            "out_duration": clip.get("duration"),
        }
    motion = float(clip["motion"])
    fps = float(clip.get("fps") or 0.0)
    lo = max(_HARD_MIN, float(min_speed))
    hi = min(_HARD_MAX, float(max_speed))

    category = "keep"
    reason = ""
    confidence = 0.5

    if mode == "normalize":
        # speed = motion/target → motion cao (động) ⇒ speed<1 (chậm lại), motion thấp ⇒ nhanh.
        tgt = target_motion if target_motion > 0 else (p_lo + p_hi) / 2.0 or motion
        speed = tgt / motion if motion > 1e-6 else 1.0
        category = "slowmo" if speed < 1.0 else ("speedup" if speed > 1.0 else "keep")
        reason = f"chuẩn-hoá motion {motion:.3f}→mục tiêu {tgt:.3f}"
        # confidence cao khi motion lệch xa target.
        confidence = _clamp(abs(speed - 1.0) / 1.0, 0.2, 0.95)
    else:
        # content (mặc định) + music-fallback: dùng percentile.
        if motion >= p_hi:
            # càng động (motion→max) càng slow-mo mạnh (→ slowmo_floor).
            speed = _map_range(motion, p_hi, max(p_hi + 1e-6, clip.get("_motion_max", p_hi)), 0.7, slowmo_floor)
            category = "slowmo"
            reason = f"motion {motion:.3f} ≥ p80 {p_hi:.3f} (cảnh động) → slow-mo"
            confidence = _clamp(_map_range(motion, p_hi, clip.get("_motion_max", p_hi), 0.6, 0.95), 0.6, 0.95)
        elif motion <= p_lo:
            # càng tĩnh (motion→min) càng tua nhanh (→ speedup_ceiling).
            speed = _map_range(motion, p_lo, min(p_lo - 1e-6, clip.get("_motion_min", p_lo)), 1.3, speedup_ceiling)
            category = "speedup"
            reason = f"motion {motion:.3f} ≤ p20 {p_lo:.3f} (cảnh tĩnh) → tua nhanh"
            confidence = _clamp(_map_range(motion, p_lo, clip.get("_motion_min", p_lo), 0.6, 0.9), 0.6, 0.9)
        else:
            speed = 1.0
            category = "keep"
            reason = f"motion {motion:.3f} ∈ (p20,p80) → giữ 1.0x"
            confidence = 0.5

    speed = _clamp(speed, lo, hi)
    speed, gated = _fps_gated_slowmo(speed, fps, smooth_fps, max(lo, slowmo_fps_floor))
    if gated:
        reason += f" · fps-gate {fps:.0f}<{smooth_fps:.0f} → giới hạn slow-mo"
        confidence = min(confidence, 0.6)

    out_dur = None
    if clip.get("duration"):
        out_dur = round(float(clip["duration"]) / speed, 3)

    return {
        "path": path,
        "speed": round(speed, 3),
        "reason": reason,
        "confidence": round(confidence, 2),
        "motion": round(motion, 4),
        "fps": round(fps, 2),
        "category": category,
        "fps_gated": gated,
        "in_duration": clip.get("duration"),
        "out_duration": out_dur,
    }


def plan_speed_batch(
    analysis: dict,
    *,
    mode: str = "content",
    p_lo: float = 20.0,
    p_hi: float = 80.0,
    min_speed: float = 0.5,
    max_speed: float = 2.0,
    slowmo_floor: float = 0.5,
    speedup_ceiling: float = 2.0,
    target_motion: float = 0.0,
    smooth_fps: float = 50.0,
    slowmo_fps_floor: float = 0.8,
    target_duration_sec: float = 0.0,
) -> dict:
    """Quyết speed cho cả batch.

    analysis = {"clips": [...], "distribution": {...}} (output speed_analyze.analyze_speed_batch),
    HOẶC chỉ {"clips": [...]} (tự tính phân bố). p_lo/p_hi = percentile (mặc định 20/80).
    """
    clips = analysis.get("clips") or []
    motions = sorted(float(c["motion"]) for c in clips if "motion" in c)
    m_lo = _pct(motions, p_lo)
    m_hi = _pct(motions, p_hi)
    m_min = motions[0] if motions else 0.0
    m_max = motions[-1] if motions else 0.0

    # Nhồi min/max vào từng clip để map cường độ slow-mo/tua theo biên thật.
    for c in clips:
        c["_motion_min"] = m_min
        c["_motion_max"] = m_max

    decisions = [
        plan_clip_speed(
            c,
            m_lo,
            m_hi,
            mode=mode,
            min_speed=min_speed,
            max_speed=max_speed,
            slowmo_floor=slowmo_floor,
            speedup_ceiling=speedup_ceiling,
            target_motion=target_motion,
            smooth_fps=smooth_fps,
            slowmo_fps_floor=slowmo_fps_floor,
        )
        for c in clips
    ]

    # Mode duration: co/giãn ĐỀU thêm 1 hệ số để tổng out_duration ≈ target.
    duration_scale = 1.0
    if mode == "duration" and target_duration_sec > 0:
        total_out = sum(d["out_duration"] or 0.0 for d in decisions)
        if total_out > 1e-3:
            # muốn total_out/duration_scale == target → scale = total_out/target.
            duration_scale = _clamp(total_out / target_duration_sec, _HARD_MIN, _HARD_MAX)
            for d in decisions:
                new_speed = _clamp(d["speed"] * duration_scale, max(_HARD_MIN, min_speed), min(_HARD_MAX, max_speed))
                d["speed"] = round(new_speed, 3)
                if d.get("in_duration"):
                    d["out_duration"] = round(float(d["in_duration"]) / new_speed, 3)
                d["reason"] += f" · co-giãn x{duration_scale:.2f} (mục tiêu {target_duration_sec:.0f}s)"

    n_slow = sum(1 for d in decisions if d["category"] == "slowmo")
    n_fast = sum(1 for d in decisions if d["category"] == "speedup")
    n_keep = sum(1 for d in decisions if d["category"] == "keep")
    n_gated = sum(1 for d in decisions if d["fps_gated"])
    total_in = sum(float(d.get("in_duration") or 0) for d in decisions)
    total_out = sum(float(d.get("out_duration") or 0) for d in decisions)

    summary = {
        "mode": mode,
        "count": len(decisions),
        "thresholds": {"p_lo": round(m_lo, 4), "p_hi": round(m_hi, 4), "p_lo_pct": p_lo, "p_hi_pct": p_hi},
        "n_slowmo": n_slow,
        "n_speedup": n_fast,
        "n_keep": n_keep,
        "n_fps_gated": n_gated,
        "total_in_sec": round(total_in, 2),
        "total_out_sec": round(total_out, 2),
        "duration_scale": round(duration_scale, 3),
    }
    log.info(
        "speed_plan_batch",
        mode=mode,
        count=len(decisions),
        slowmo=n_slow,
        speedup=n_fast,
        keep=n_keep,
        gated=n_gated,
        p_lo=round(m_lo, 4),
        p_hi=round(m_hi, 4),
    )
    return {"decisions": decisions, "summary": summary}

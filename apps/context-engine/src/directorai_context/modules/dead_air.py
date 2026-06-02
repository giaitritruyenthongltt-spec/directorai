"""LF4 — Cắt dead-air / khoảng lặng tự động (hero feature cho phim dài).

Video dài (đặc biệt Nerf: nhiều đoạn chờ/nạp đạn/di chuyển) chứa rất nhiều
"khoảng chết" ở ĐẦU và CUỐI mỗi clip. Module này phát hiện khoảng lặng ở rìa
clip và sinh sẵn các bước SAFE (trim / disable) — đúng định dạng EditPlanStep
nên cắm thẳng vào luồng an toàn (preview → duyệt → ghi).

Giới hạn có chủ đích: chỉ cắt khoảng lặng ở RÌA (đầu/cuối). Khoảng lặng GIỮA
clip cần "split" (Premiere 26 chưa cho plugin ghi) → bỏ qua, không bịa.
"""

from __future__ import annotations

from pathlib import Path

from directorai_context.config import get_settings
from directorai_context.logger import log
from directorai_context.modules.audio_analyze import Silence, detect_silences

# Sai số cạnh: silence coi là "ở đầu" nếu bắt đầu trước mốc này; "ở cuối" nếu
# kết thúc sau (duration - mốc này).
_EDGE_SEC = 0.08


def _trim_for_clip(
    media_path: str,
    duration: float,
    silences: list[Silence],
    *,
    min_silence_sec: float,
    keep_padding_sec: float,
    disable_if_silent_ratio: float,
    min_kept_sec: float,
) -> dict | None:
    """Thuần — từ duration + silences của 1 clip → 1 bước trim/disable hoặc None.

    - Nếu clip gần như im lặng toàn bộ (tỉ lệ lặng ≥ disable_if_silent_ratio)
      → disable (ẩn khỏi bản dựng).
    - Ngược lại, cắt khoảng lặng ĐẦU (in_sec) và CUỐI (out_sec), chừa
      keep_padding_sec để không cụt tiếng. Trả None nếu không có gì đáng cắt
      hoặc phần giữ lại quá ngắn (< min_kept_sec).
    """
    if duration <= 0:
        return None

    total_silent = sum(s.end_sec - s.start_sec for s in silences)
    if total_silent / duration >= disable_if_silent_ratio and duration >= min_silence_sec:
        return {
            "action": "disable",
            "target_path": media_path,
            "params": {},
            "reason": (
                f"Clip gần như im lặng toàn bộ ({total_silent:.1f}s/{duration:.1f}s) — ẩn khỏi bản dựng"
            ),
            "reversible": True,
        }

    lead_end = 0.0
    tail_start = duration
    for s in silences:
        dur = s.end_sec - s.start_sec
        if dur < min_silence_sec:
            continue
        if s.start_sec <= _EDGE_SEC:
            lead_end = max(lead_end, s.end_sec)
        if s.end_sec >= duration - _EDGE_SEC:
            tail_start = min(tail_start, s.start_sec)

    in_sec = max(0.0, lead_end - keep_padding_sec) if lead_end > 0 else 0.0
    out_sec = (
        min(duration, tail_start + keep_padding_sec) if tail_start < duration else duration
    )

    # Không cắt được gì đáng kể ở cả hai rìa.
    if in_sec <= _EDGE_SEC and out_sec >= duration - _EDGE_SEC:
        return None
    # Phần giữ lại quá ngắn → bỏ (tránh cắt nát).
    if out_sec - in_sec < min_kept_sec:
        return None

    return {
        "action": "trim",
        "target_path": media_path,
        "params": {"in_sec": round(in_sec, 3), "out_sec": round(out_sec, 3)},
        "reason": (
            f"Bỏ khoảng lặng đầu/cuối — giữ {in_sec:.1f}s..{out_sec:.1f}s "
            f"(cắt {(in_sec + (duration - out_sec)):.1f}s chết)"
        ),
        "reversible": True,
    }


def plan_dead_air(
    media_paths: list[str],
    *,
    min_silence_sec: float = 1.0,
    keep_padding_sec: float = 0.25,
    threshold_db: float = -40.0,
    disable_if_silent_ratio: float = 0.85,
    min_kept_sec: float = 0.5,
) -> dict:
    """Quét list clip → kế hoạch cắt dead-air (steps đúng định dạng EditPlanStep).

    Trả dict: steps[], analyzed, errors[], total_trims, total_disables,
    estimated_saved_sec.
    """
    import librosa

    cfg = get_settings()
    steps: list[dict] = []
    errors: list[dict] = []
    analyzed = 0
    saved = 0.0

    for path_str in media_paths:
        path = Path(path_str)
        if not path.exists():
            errors.append({"clip_path": path_str, "error": "không tìm thấy file"})
            continue
        try:
            audio, sr = librosa.load(str(path), sr=cfg.beat_sample_rate, mono=True)
            duration = len(audio) / sr if sr else 0.0
            silences = detect_silences(
                audio, sr, threshold_db=threshold_db, min_silence_sec=min_silence_sec
            )
            step = _trim_for_clip(
                path_str,
                duration,
                silences,
                min_silence_sec=min_silence_sec,
                keep_padding_sec=keep_padding_sec,
                disable_if_silent_ratio=disable_if_silent_ratio,
                min_kept_sec=min_kept_sec,
            )
            analyzed += 1
            if step:
                if step["action"] == "trim":
                    p = step["params"]
                    saved += duration - (p["out_sec"] - p["in_sec"])
                elif step["action"] == "disable":
                    saved += duration
                steps.append(step)
        except Exception as e:
            log.error("dead_air_clip_failed", media=path_str, error=str(e))
            errors.append({"clip_path": path_str, "error": str(e)})

    for i, s in enumerate(steps):
        s["order"] = i + 1

    log.info(
        "dead_air_done",
        analyzed=analyzed,
        steps=len(steps),
        saved_sec=round(saved, 1),
    )
    return {
        "steps": steps,
        "analyzed": analyzed,
        "errors": errors,
        "total_trims": sum(1 for s in steps if s["action"] == "trim"),
        "total_disables": sum(1 for s in steps if s["action"] == "disable"),
        "estimated_saved_sec": round(saved, 1),
    }

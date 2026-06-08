"""SPEED P3 — Nối quyết-định tốc độ (P2) vào Lane-B render (FFmpeg setpts+atempo).

Pipeline: clip_paths -> analyze (P1) -> plan (P2) -> với mỗi clip speed != 1.0:
render lại bằng recut_render (recipe.speed) -> probe output -> VERIFY (fps giữ nguyên,
duration ~= in/speed). Clip speed 1.0 hoặc lỗi: BỎ QUA (giữ bản gốc) trừ khi ép.

Đây là ĐƯỜNG GHI MVP (đóng R1/R2/R5): re-render per-clip, audio giữ pitch (atempo).
KHÔNG trộn trim/reorder/color — chạy độc lập (G6).
"""

from __future__ import annotations

from pathlib import Path

from directorai_context.logger import log
from directorai_context.modules.speed_analyze import analyze_speed_batch
from directorai_context.modules.speed_plan import plan_speed_batch

# Sai số duration cho phép khi verify (giây). FFmpeg cắt theo GOP nên lệch nhẹ.
_DUR_TOL = 0.35


def _out_path_for(src: str, speed: float, out_dir: str | None) -> str:
    p = Path(src)
    stem = p.stem
    tag = f"{speed:.3f}".rstrip("0").rstrip(".").replace(".", "_")
    name = f"{stem}_speed{tag}x{p.suffix}"
    base = Path(out_dir) if out_dir else p.parent
    return str(base / name)


def _verify_output(out: str, in_fps: float, expected_dur: float | None) -> dict:
    """Probe output, so fps (giữ nguyên) + duration (~= in/speed)."""
    from directorai_context.modules.recut_pipeline import probe_media

    try:
        info = probe_media(out)
    except Exception as e:
        return {"ok": False, "error": f"probe lỗi: {e}"}
    out_fps = round(float(info.get("fps") or 0), 2)
    out_dur = round(float(info.get("duration") or 0), 3)
    fps_ok = in_fps <= 0 or abs(out_fps - round(in_fps, 2)) <= 1.0
    dur_ok = expected_dur is None or abs(out_dur - expected_dur) <= max(_DUR_TOL, expected_dur * 0.05)
    return {
        "ok": bool(fps_ok and dur_ok),
        "out_fps": out_fps,
        "out_duration": out_dur,
        "expected_duration": expected_dur,
        "fps_ok": fps_ok,
        "dur_ok": dur_ok,
    }


def render_speed_batch(
    clip_paths: list[str],
    *,
    samples: int = 12,
    mode: str = "content",
    out_dir: str | None = None,
    use_nvenc: bool = True,
    skip_unity: bool = True,
    dry_run: bool = False,
    plan_kwargs: dict | None = None,
) -> dict:
    """Analyze -> plan -> render speed-only -> verify. Trả plan + kết quả render."""
    from directorai_context.modules.recut_pipeline import has_ffmpeg, recut_render

    analysis = analyze_speed_batch(clip_paths, samples=samples)
    plan = plan_speed_batch(analysis, mode=mode, **(plan_kwargs or {}))

    if out_dir:
        Path(out_dir).mkdir(parents=True, exist_ok=True)

    results = []
    rendered = skipped = failed = 0
    for d in plan["decisions"]:
        src = d["path"]
        speed = float(d.get("speed") or 1.0)
        in_fps = float(d.get("fps") or 0.0)
        expected_dur = d.get("out_duration")
        row = {
            "path": src,
            "speed": speed,
            "category": d.get("category"),
            "reason": d.get("reason"),
            "expected_duration": expected_dur,
        }
        if d.get("category") == "error":
            row.update(action="skip", note="clip lỗi phân tích")
            skipped += 1
            results.append(row)
            continue
        if skip_unity and abs(speed - 1.0) < 1e-3:
            row.update(action="keep", note="speed 1.0x → giữ bản gốc")
            skipped += 1
            results.append(row)
            continue
        out = _out_path_for(src, speed, out_dir)
        row["out_path"] = out
        if dry_run:
            row.update(action="plan")
            results.append(row)
            continue
        if not has_ffmpeg():
            row.update(action="error", note="ffmpeg không có trong PATH")
            failed += 1
            results.append(row)
            continue
        try:
            recipe = {"speed": speed, "bgm": "keep", "strip_metadata": False}
            r = recut_render(src, out, recipe, use_nvenc=use_nvenc)
            verify = _verify_output(out, in_fps, expected_dur)
            row.update(
                action="render",
                ok=bool(r.get("ok")) and verify["ok"],
                elapsed_ms=r.get("elapsed_ms"),
                audio_changed=r.get("audio_changed"),
                applied=r.get("applied"),
                verify=verify,
            )
            rendered += 1
        except Exception as e:  # 1 clip lỗi không hỏng batch
            log.warning("speed_render_fail", clip=src, error=str(e))
            row.update(action="error", note=str(e))
            failed += 1
        results.append(row)

    summary = {
        **plan["summary"],
        "rendered": rendered,
        "skipped": skipped,
        "failed": failed,
        "dry_run": dry_run,
        "verified_ok": sum(1 for r in results if r.get("ok")),
    }
    log.info("speed_render_batch", rendered=rendered, skipped=skipped, failed=failed, dry_run=dry_run)
    return {"results": results, "summary": summary, "plan": plan}

"""P0 ASM — Ghép nhiều clip (đã chọn/sắp/tỉa/đổi tốc độ) thành 1 PHIM hoàn chỉnh.

Đây là MỐI NỐI còn thiếu khép kín luồng "folder -> phân tích -> sắp -> tỉa/tốc độ -> 1 SẢN PHẨM".
Render headless qua FFmpeg filter_complex concat (chuẩn-hoá WxH/fps, atempo giữ pitch),
KHÔNG phụ thuộc UXP insert (vốn bị chặn trên PPro26). Verify được 100% bằng ffprobe.

Mỗi segment = {path, in_sec?, out_sec?, speed?}. Clip thiếu audio -> chèn anullsrc để concat
a=1 không vỡ. NVENC -> x264 fallback, ghi atomic (.part -> rename).
"""

from __future__ import annotations

import os
from pathlib import Path

from directorai_context.logger import log
from directorai_context.modules.recut_pipeline import _run_ffmpeg, has_ffmpeg, probe_media

_HARD_MIN_SPEED = 0.5
_HARD_MAX_SPEED = 2.0


def _seg_out_duration(in_dur: float, in_sec: float | None, out_sec: float | None, speed: float) -> float:
    """Độ dài segment trên timeline sau trim + đổi tốc độ."""
    a = max(0.0, in_sec or 0.0)
    b = out_sec if (out_sec and out_sec > a) else in_dur
    b = min(b, in_dur) if in_dur > 0 else b
    raw = max(0.0, b - a)
    return raw / speed if speed > 0 else raw


def _atempo_chain(speed: float) -> str:
    """atempo chỉ ổn 0.5-2.0; ghép nhiều atempo nếu ngoài khoảng (ở đây đã clamp)."""
    return f"atempo={max(0.5, min(2.0, speed))}"


def _build_filtergraph(
    segs: list[dict],
    has_audio: list[bool],
    silent_input_index: dict[int, int],
    w: int,
    h: int,
    fps: float,
) -> tuple[str, str, str]:
    """Trả (filter_complex, vlabel_out, alabel_out)."""
    parts: list[str] = []
    vlabels: list[str] = []
    alabels: list[str] = []
    for i, seg in enumerate(segs):
        in_s = seg.get("in_sec")
        out_s = seg.get("out_sec")
        speed = max(_HARD_MIN_SPEED, min(_HARD_MAX_SPEED, float(seg.get("speed") or 1.0)))
        # ── video ──
        v = f"[{i}:v]"
        vchain = []
        if in_s is not None or out_s is not None:
            trim = "trim="
            trim += f"start={float(in_s)}" if in_s is not None else "start=0"
            if out_s is not None:
                trim += f":end={float(out_s)}"
            vchain.append(trim)
            vchain.append("setpts=PTS-STARTPTS")
        if abs(speed - 1.0) > 1e-3:
            vchain.append(f"setpts=PTS/{speed}")
        vchain.append(f"scale={w}:{h}:force_original_aspect_ratio=decrease")
        vchain.append(f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2")
        vchain.append("setsar=1")
        vchain.append(f"fps={fps}")
        vlab = f"[v{i}]"
        parts.append(f"{v}{','.join(vchain)}{vlab}")
        vlabels.append(vlab)
        # ── audio ── (clip thật hoặc anullsrc thay thế)
        if has_audio[i]:
            a = f"[{i}:a]"
            achain = []
            if in_s is not None or out_s is not None:
                atrim = "atrim="
                atrim += f"start={float(in_s)}" if in_s is not None else "start=0"
                if out_s is not None:
                    atrim += f":end={float(out_s)}"
                achain.append(atrim)
                achain.append("asetpts=PTS-STARTPTS")
            if abs(speed - 1.0) > 1e-3:
                achain.append(_atempo_chain(speed))
            achain.append("aresample=48000")
            achain.append("aformat=sample_fmts=fltp:channel_layouts=stereo")
            alab = f"[a{i}]"
            parts.append(f"{a}{','.join(achain)}{alab}")
            alabels.append(alab)
        else:
            si = silent_input_index[i]
            alab = f"[a{i}]"
            parts.append(f"[{si}:a]aformat=sample_fmts=fltp:channel_layouts=stereo{alab}")
            alabels.append(alab)
    inter = "".join(v + a for v, a in zip(vlabels, alabels, strict=True))
    parts.append(f"{inter}concat=n={len(segs)}:v=1:a=1[vout][aout]")
    return ";".join(parts), "[vout]", "[aout]"


def assemble_film(
    segments: list[dict],
    out_path: str,
    *,
    width: int | None = None,
    height: int | None = None,
    fps: float | None = None,
    use_nvenc: bool = True,
    job_id: str | None = None,
) -> dict:
    """Ghép segments -> 1 file. segments[i] = {path, in_sec?, out_sec?, speed?}.

    Chuẩn-hoá về (width,height,fps) — mặc định lấy từ clip ĐẦU (cap fps<=60). Trả
    {ok, out_path, duration_sec, expected_duration, clips, applied, error}.
    """
    if not has_ffmpeg():
        raise RuntimeError("ffmpeg không có trong PATH")
    if not segments:
        raise ValueError("segments rỗng")

    probes = []
    for seg in segments:
        p = seg["path"]
        info = probe_media(p)
        probes.append(info)

    first = probes[0]
    w = int(width or first.get("width") or 1920)
    h = int(height or first.get("height") or 1080)
    w -= w % 2
    h -= h % 2
    f = float(fps or first.get("fps") or 30.0)
    if f > 60:
        f = 60.0
    if f <= 0:
        f = 30.0

    has_audio = [bool(p.get("has_audio")) for p in probes]
    expected = sum(
        _seg_out_duration(
            float(probes[i].get("duration") or 0),
            segments[i].get("in_sec"),
            segments[i].get("out_sec"),
            max(_HARD_MIN_SPEED, min(_HARD_MAX_SPEED, float(segments[i].get("speed") or 1.0))),
        )
        for i in range(len(segments))
    )

    cmd: list[str] = ["ffmpeg", "-y"]
    for seg in segments:
        cmd += ["-i", seg["path"]]
    # Input anullsrc cho clip thiếu audio (1 input/clip-câm), index nối sau các -i thật.
    silent_input_index: dict[int, int] = {}
    next_idx = len(segments)
    for i, ha in enumerate(has_audio):
        if not ha:
            cmd += ["-f", "lavfi", "-t", "0.1", "-i", "anullsrc=r=48000:cl=stereo"]
            silent_input_index[i] = next_idx
            next_idx += 1

    fg, vout, aout = _build_filtergraph(segments, has_audio, silent_input_index, w, h, f)

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp_out = out.with_suffix(f".part{out.suffix}")

    def build(vcodec: list[str]) -> list[str]:
        return [
            *cmd,
            "-filter_complex", fg,
            "-map", vout, "-map", aout,
            *vcodec,
            "-c:a", "aac", "-b:a", "192k",
            "-r", str(f),
            str(tmp_out),
        ]

    nvenc = ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "23", "-b:v", "0"]
    x264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p"]

    log.info("assemble_ffmpeg", clips=len(segments), w=w, h=h, fps=f, nvenc=use_nvenc)
    rc, err = _run_ffmpeg(build(nvenc if use_nvenc else x264), job_id)
    encoder = "nvenc" if use_nvenc else "x264"
    if rc != 0 and use_nvenc:
        log.warning("assemble_nvenc_fail_fallback_x264", err=err[-300:])
        rc, err = _run_ffmpeg(build(x264), job_id)
        encoder = "x264"
    if rc != 0:
        with __import__("contextlib").suppress(Exception):
            tmp_out.unlink(missing_ok=True)
        return {"ok": False, "out_path": str(out), "error": err[-400:], "clips": len(segments)}

    os.replace(str(tmp_out), str(out))
    final = probe_media(str(out))
    return {
        "ok": True,
        "out_path": str(out),
        "duration_sec": round(float(final.get("duration") or 0), 3),
        "expected_duration": round(expected, 3),
        "width": int(final.get("width") or w),
        "height": int(final.get("height") or h),
        "fps": round(float(final.get("fps") or f), 3),
        "clips": len(segments),
        "encoder": encoder,
        "applied": ["concat", f"{w}x{h}@{f}"],
    }


def build_auto_segments(
    clip_paths: list[str],
    *,
    with_dead_air: bool = False,
    with_speed: bool = False,
    speed_mode: str = "content",
    dead_air_opts: dict | None = None,
) -> dict:
    """0-token: từ list clip -> segments có in/out (cắt lặng) + speed (CV percentile).

    Giữ THỨ TỰ đầu vào (UI/người dùng đã sắp). Trả {segments, dropped, notes}.
    """
    segs = [{"path": p} for p in clip_paths]
    trims: dict[str, tuple[float, float]] = {}
    drops: set[str] = set()
    notes: list[str] = []

    if with_dead_air:
        try:
            from directorai_context.modules.dead_air import plan_dead_air

            da = plan_dead_air(clip_paths, **(dead_air_opts or {}))
            for st in da.get("steps", []):
                tp = st.get("target_path")
                if not tp:
                    continue
                if st["action"] == "trim":
                    trims[tp] = (st["params"]["in_sec"], st["params"]["out_sec"])
                elif st["action"] == "disable":
                    drops.add(tp)
            notes.append(f"dead-air: {da.get('total_trims', 0)} tỉa, {da.get('total_disables', 0)} bỏ")
        except Exception as e:  # librosa/audio lỗi không làm hỏng assemble
            log.warning("assemble_dead_air_fail", error=str(e))

    speeds: dict[str, float] = {}
    if with_speed:
        try:
            from directorai_context.modules.speed_analyze import analyze_speed_batch
            from directorai_context.modules.speed_plan import plan_speed_batch

            plan = plan_speed_batch(analyze_speed_batch(clip_paths, samples=8), mode=speed_mode)
            for d in plan.get("decisions", []):
                if d.get("category") != "error":
                    speeds[d["path"]] = float(d.get("speed") or 1.0)
            s = plan.get("summary", {})
            notes.append(f"speed: {s.get('n_slowmo', 0)} chậm/{s.get('n_speedup', 0)} nhanh")
        except Exception as e:
            log.warning("assemble_speed_fail", error=str(e))

    for seg in segs:
        p = seg["path"]
        if p in trims:
            seg["in_sec"], seg["out_sec"] = trims[p]
        if p in speeds:
            seg["speed"] = speeds[p]
    kept = [s for s in segs if s["path"] not in drops]
    return {"segments": kept, "dropped": sorted(drops), "notes": notes}


def assemble_auto(
    clip_paths: list[str],
    out_path: str,
    *,
    with_dead_air: bool = False,
    with_speed: bool = False,
    speed_mode: str = "content",
    width: int | None = None,
    height: int | None = None,
    fps: float | None = None,
    use_nvenc: bool = True,
    job_id: str | None = None,
    dead_air_opts: dict | None = None,
    plan_only: bool = False,
) -> dict:
    """Khép kín: clip_paths -> (CV tỉa/tốc độ) -> ghép 1 PHIM. 0-token mặc định.

    plan_only=True: CHỈ trả segments + probe (duration/fps/wh) mỗi clip, KHÔNG render.
    Dùng cho ASM-4 (server dựng FCPXML editable từ buildContiguousTimeline).
    """
    built = build_auto_segments(
        clip_paths,
        with_dead_air=with_dead_air,
        with_speed=with_speed,
        speed_mode=speed_mode,
        dead_air_opts=dead_air_opts,
    )
    segs = built["segments"]
    if not segs:
        raise ValueError("không còn clip nào sau khi lọc")

    if plan_only:
        probes = {}
        for s in segs:
            try:
                info = probe_media(s["path"])
                probes[s["path"]] = {
                    "duration": round(float(info.get("duration") or 0), 3),
                    "fps": round(float(info.get("fps") or 0), 3),
                    "width": int(info.get("width") or 0),
                    "height": int(info.get("height") or 0),
                    "has_audio": bool(info.get("has_audio")),
                }
            except Exception as e:  # 1 clip lỗi không hỏng plan
                log.warning("assemble_plan_probe_fail", clip=s["path"], error=str(e))
        return {
            "ok": True,
            "plan_only": True,
            "segments": segs,
            "probes": probes,
            "dropped": built["dropped"],
            "notes": built["notes"],
        }
    result = assemble_film(
        segs, out_path, width=width, height=height, fps=fps, use_nvenc=use_nvenc, job_id=job_id
    )
    result["segments"] = segs
    result["dropped"] = built["dropped"]
    result["notes"] = built["notes"]
    return result

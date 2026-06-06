"""Lane B (headless) — cỗ máy chống-trùng: Demucs tách audio + FFmpeg dedup render.

Premiere dở ở set-param effect + không headless. Lane B chạy NGOÀI Premiere bằng
FFmpeg (flip/crop/speed/color/grain — tầm thường) + Demucs (tách/bỏ/thay nhạc nền —
đòn chống-trùng số 1, vì YouTube Content-ID là audio-first). Tham chiếu bot cũ
``D:\\CODE AI\\AUTOCUT-VIDEO\\Cut_only ver2``.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

from directorai_context.logger import log


def _ffprobe(video: str) -> dict:
    """Đọc duration + width/height + có audio không qua ffprobe."""
    out = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "stream=index,codec_type,width,height:format=duration",
            "-of", "json", video,
        ],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(out.stdout)
    streams = data.get("streams") or []
    vid = next((s for s in streams if s.get("codec_type") == "video"), {})
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    dur = float((data.get("format") or {}).get("duration", 0) or 0)
    return {
        "width": int(vid.get("width", 0)),
        "height": int(vid.get("height", 0)),
        "duration": dur,
        "has_audio": has_audio,
    }


def _torch_device() -> str:
    try:
        import torch  # type: ignore

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def separate_audio(media_path: str, model: str = "htdemucs", mode: str = "vocals") -> dict:
    """Tách stem bằng Demucs. mode='vocals' → 2 stem (vocals + no_vocals).

    Trả {ok, out_dir, stems:{vocals,no_vocals}, device, elapsed_ms}.
    """
    t0 = time.time()
    src = Path(media_path)
    if not src.exists():
        raise FileNotFoundError(media_path)
    out_dir = src.parent / "_recut_stems"
    out_dir.mkdir(exist_ok=True)
    device = _torch_device()

    # sys.executable = interpreter venv đang chạy sidecar (đảm bảo có demucs).
    cmd = [sys.executable, "-m", "demucs", "-n", model, "-o", str(out_dir), "--device", device]
    if mode == "vocals":
        cmd += ["--two-stems", "vocals"]
    cmd += [str(src)]
    log.info("demucs_start", media=str(src), device=device, model=model)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"demucs exit {proc.returncode}: {proc.stderr[-400:]}")

    stem_dir = out_dir / model / src.stem
    stems: dict[str, str] = {}
    for wav in stem_dir.glob("*.wav"):
        stems[wav.stem] = str(wav)
    elapsed = int((time.time() - t0) * 1000)
    log.info("demucs_done", stems=list(stems.keys()), elapsed_ms=elapsed)
    return {"ok": bool(stems), "out_dir": str(stem_dir), "stems": stems, "device": device, "elapsed_ms": elapsed}


def recut_render(
    video_path: str,
    out_path: str | None,
    recipe: dict,
    use_nvenc: bool = True,
) -> dict:
    """Render video chống-trùng bằng FFmpeg theo recipe. Trả report."""
    t0 = time.time()
    src = Path(video_path)
    if not src.exists():
        raise FileNotFoundError(video_path)
    out = Path(out_path) if out_path else src.with_name(f"{src.stem}_recut.mp4")
    probe = _ffprobe(str(src))
    W, H = probe["width"], probe["height"]
    has_audio = probe.get("has_audio", False)
    applied: list[str] = []

    # ── Video filter chain ───────────────────────────────────────────────
    vf: list[str] = []
    if recipe.get("flip"):
        vf.append("hflip")
        applied.append("flip")
    cp = float(recipe.get("crop_pct") or 0)
    if cp > 0 and W and H:
        f = cp / 100.0
        vf.append(f"crop=iw*{1 - 2 * f:.4f}:ih*{1 - 2 * f:.4f},scale={W}:{H}")
        applied.append(f"crop{cp}%")
    sat = float(recipe.get("saturation") or 1.0)
    bri = float(recipe.get("brightness") or 0.0)
    if abs(sat - 1.0) > 1e-3 or abs(bri) > 1e-3:
        vf.append(f"eq=saturation={sat}:brightness={bri}")
        applied.append("color")
    grain = float(recipe.get("grain") or 0)
    if grain > 0:
        vf.append(f"noise=alls={int(grain)}:allf=t")
        applied.append("grain")
    speed = float(recipe.get("speed") or 1.0)
    if abs(speed - 1.0) > 1e-3:
        vf.append(f"setpts=PTS/{speed}")
        applied.append(f"speed{speed}x")

    # ── Audio (đòn chống-trùng số 1) ─────────────────────────────────────
    bgm = recipe.get("bgm", "keep")
    audio_changed = False
    audio_inputs: list[str] = []  # extra -i sau video gốc (index 1,2,…)
    base_alabel = "0:a"  # nhãn audio nền trước khi atempo
    extra_chain = ""  # đoạn filter sinh nhãn [abase] (vd amix)

    demucs_error: str | None = None
    if bgm in ("strip", "replace") and has_audio:
        try:
            sep = separate_audio(str(src))
        except Exception as e:  # noqa: BLE001 — degrade mềm: vẫn render visual
            demucs_error = str(e)[-200:]
            log.warning("demucs_unavailable_degrade", error=demucs_error)
            sep = {"stems": {}}
        vocals = sep["stems"].get("vocals")
        if vocals:
            audio_inputs += ["-i", vocals]  # input 1 = vocals
            audio_changed = True
            if bgm == "strip":
                base_alabel = "1:a"  # chỉ giọng (bỏ nhạc nền)
                applied.append("strip_bgm")
            elif bgm == "replace" and recipe.get("new_bgm_path"):
                audio_inputs += ["-i", recipe["new_bgm_path"]]  # input 2 = nhạc mới
                gain = float(recipe.get("bgm_gain_db") or -6.0)
                extra_chain = (
                    f"[2:a]volume={gain}dB[bg];[1:a][bg]amix=inputs=2:duration=first[abase]"
                )
                base_alabel = "abase"
                applied.append("replace_bgm")

    speed_a = abs(speed - 1.0) > 1e-3
    # Chỉ xử lý audio khi video CÓ audio stream (clip ghép có thể không có).
    has_audio_work = has_audio and (audio_changed or speed_a)

    # ── Lắp lệnh ffmpeg ──────────────────────────────────────────────────
    vcodec = (
        ["-c:v", "h264_nvenc", "-preset", "p4", "-b:v", "8M"]
        if use_nvenc
        else ["-c:v", "libx264", "-crf", "20"]
    )
    cmd = ["ffmpeg", "-y", "-i", str(src), *audio_inputs]
    fc: list[str] = []
    if vf:
        fc.append(f"[0:v]{','.join(vf)}[vout]")
    vmap = "[vout]" if vf else "0:v"

    def br(lbl: str) -> str:
        """Bọc nhãn cho filtergraph input ('0:a' → '[0:a]', 'abase' → '[abase]')."""
        return f"[{lbl}]"

    amap = "0:a?"
    if has_audio_work:
        if extra_chain:
            fc.append(extra_chain)  # → [abase]
        if speed_a:
            tempo = max(0.5, min(2.0, speed))
            fc.append(f"{br(base_alabel)}atempo={tempo}[aout]")
            amap = "[aout]"
        elif extra_chain:
            amap = "[abase]"  # replace_bgm, không đổi tốc độ
        else:
            amap = base_alabel  # strip: '1:a' (map thẳng, không qua filter)

    if fc:
        cmd += ["-filter_complex", ";".join(fc)]
    cmd += ["-map", vmap, "-map", amap]
    cmd += [*vcodec, "-c:a", "aac", "-b:a", "192k", str(out)]

    log.info("recut_ffmpeg", applied=applied, nvenc=use_nvenc)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        return {
            "ok": False, "out_path": str(out), "duration_sec": probe["duration"],
            "audio_changed": audio_changed, "applied": applied,
            "elapsed_ms": int((time.time() - t0) * 1000),
            "error": proc.stderr[-600:],
        }
    out_dur = _ffprobe(str(out))["duration"] if out.exists() else 0.0
    if demucs_error:
        applied.append("bgm_skipped(demucs_unavailable)")
    return {
        "ok": True, "out_path": str(out), "duration_sec": out_dur,
        "audio_changed": audio_changed, "applied": applied,
        "elapsed_ms": int((time.time() - t0) * 1000),
        "error": (f"demucs degrade: {demucs_error}" if demucs_error else None),
    }


def has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None

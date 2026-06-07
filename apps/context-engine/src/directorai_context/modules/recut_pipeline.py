"""Lane B (headless) — cỗ máy chống-trùng: Demucs tách audio + FFmpeg dedup render.

Premiere dở ở set-param effect + không headless. Lane B chạy NGOÀI Premiere bằng
FFmpeg (flip/crop/speed/color/grain — tầm thường) + Demucs (tách/bỏ/thay nhạc nền —
đòn chống-trùng số 1, vì YouTube Content-ID là audio-first). Tham chiếu bot cũ
``D:\\CODE AI\\AUTOCUT-VIDEO\\Cut_only ver2``.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from directorai_context.config import get_settings
from directorai_context.logger import log


def _parse_fps(rate: str | None) -> float:
    """'30000/1001' → 29.97; '30' → 30.0; lỗi → 0.0."""
    if not rate:
        return 0.0
    try:
        if "/" in rate:
            num, den = rate.split("/", 1)
            d = float(den)
            return float(num) / d if d else 0.0
        return float(rate)
    except (ValueError, ZeroDivisionError):
        return 0.0


def _ffprobe(video: str) -> dict:
    """Đọc duration + width/height + fps + có audio không qua ffprobe."""
    out = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries",
            "stream=index,codec_type,width,height,r_frame_rate:format=duration",
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
        "fps": _parse_fps(vid.get("r_frame_rate")),
        "duration": dur,
        "has_audio": has_audio,
    }


def probe_media(video: str) -> dict:
    """Public probe: {width,height,fps,duration,has_audio}. Cho cut-list FCPXML."""
    src = Path(video)
    if not src.exists():
        raise FileNotFoundError(video)
    return _ffprobe(str(src))


def _torch_device() -> str:
    try:
        import torch  # type: ignore

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _stems_base_dir(src: Path) -> Path:
    """Thư mục stems = ~/.directorai/cache/recut_stems/<hash-abspath>. B3 — KHÔNG
    ghi vào thư mục input của user (tránh rác kho gốc 3000 tập); hash theo abspath
    để 2 file cùng tên ở 2 thư mục khác nhau (S1/ep01, S2/ep01) không đè stems."""
    h = hashlib.sha1(str(src.resolve()).encode("utf-8")).hexdigest()[:12]
    return get_settings().cache_dir / "recut_stems" / h


def _stems_fresh(stem_dir: Path, src: Path) -> bool:
    """Stems còn dùng được nếu mọi .wav mới HƠN (>=) file nguồn."""
    try:
        smt = src.stat().st_mtime
        wavs = list(stem_dir.glob("*.wav"))
        return bool(wavs) and all(w.stat().st_mtime >= smt for w in wavs)
    except OSError:
        return False


def separate_audio(
    media_path: str,
    model: str = "htdemucs",
    mode: str = "vocals",
    out_dir: str | None = None,
) -> dict:
    """Tách stem bằng Demucs. mode='vocals' → 2 stem (vocals + no_vocals).

    Trả {ok, out_dir, stems:{vocals,no_vocals}, device, elapsed_ms, cached}.
    Có CACHE: nếu stems đã tồn tại và mới hơn nguồn → tái dùng (Demucs ~26s/clip).
    """
    t0 = time.time()
    src = Path(media_path)
    if not src.exists():
        raise FileNotFoundError(media_path)
    base = Path(out_dir) if out_dir else _stems_base_dir(src)
    base.mkdir(parents=True, exist_ok=True)
    stem_dir = base / model / src.stem

    # CACHE hit — đủ stem cần + còn tươi.
    if stem_dir.exists():
        cached = {w.stem: str(w) for w in stem_dir.glob("*.wav")}
        need = {"vocals", "no_vocals"} if mode == "vocals" else set(cached.keys())
        if cached and need.issubset(cached.keys()) and _stems_fresh(stem_dir, src):
            elapsed = int((time.time() - t0) * 1000)
            log.info("demucs_cache_hit", stems=list(cached.keys()))
            return {
                "ok": True, "out_dir": str(stem_dir), "stems": cached,
                "device": "cache", "elapsed_ms": elapsed, "cached": True,
            }

    device = _torch_device()
    # sys.executable = interpreter venv đang chạy sidecar (đảm bảo có demucs).
    cmd = [sys.executable, "-m", "demucs", "-n", model, "-o", str(base), "--device", device]
    if mode == "vocals":
        cmd += ["--two-stems", "vocals"]
    cmd += [str(src)]
    log.info("demucs_start", media=str(src), device=device, model=model)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"demucs exit {proc.returncode}: {proc.stderr[-400:]}")

    stems: dict[str, str] = {}
    for wav in stem_dir.glob("*.wav"):
        stems[wav.stem] = str(wav)
    elapsed = int((time.time() - t0) * 1000)
    log.info("demucs_done", stems=list(stems.keys()), elapsed_ms=elapsed)
    return {
        "ok": bool(stems), "out_dir": str(stem_dir), "stems": stems,
        "device": device, "elapsed_ms": elapsed, "cached": False,
    }


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
    # B9 — chặn ghi đè CHÍNH file nguồn (đọc+ghi cùng path → hỏng file).
    if out.resolve() == src.resolve():
        out = src.with_name(f"{src.stem}_recut.mp4")
        if out.resolve() == src.resolve():
            raise ValueError("out_path trùng video nguồn")
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
        except Exception as e:  # degrade mềm: vẫn render visual
            demucs_error = str(e)[-200:]
            log.warning("demucs_unavailable_degrade", error=demucs_error)
            sep = {"stems": {}}
        vocals = sep["stems"].get("vocals")
        if vocals:
            audio_inputs += ["-i", vocals]  # input 1 = vocals
            audio_changed = True
            new_bgm = recipe.get("new_bgm_path")
            new_bgm_ok = bool(new_bgm) and Path(str(new_bgm)).exists()
            if bgm == "replace" and new_bgm_ok:
                audio_inputs += ["-i", str(new_bgm)]  # input 2 = nhạc mới
                gain = float(recipe.get("bgm_gain_db") or -6.0)
                extra_chain = (
                    f"[2:a]volume={gain}dB[bg];[1:a][bg]amix=inputs=2:duration=first[abase]"
                )
                base_alabel = "abase"
                applied.append("replace_bgm")
            else:
                # strip, HOẶC replace nhưng thiếu/sai file nhạc → AN TOÀN: bỏ nhạc
                # (giữ giọng) thay vì im lặng giữ nguyên audio gốc (đòn dedup hỏng).
                base_alabel = "1:a"
                if bgm == "replace":
                    applied.append("replace_no_bgm→strip")
                else:
                    applied.append("strip_bgm")

    speed_a = abs(speed - 1.0) > 1e-3
    # Chỉ xử lý audio khi video CÓ audio stream (clip ghép có thể không có).
    has_audio_work = has_audio and (audio_changed or speed_a)

    # ── Lắp filtergraph + map (chung cho mọi codec) ──────────────────────
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

    # B12/16 — ghi ATOMIC: render ra .part.<ext> rồi rename. FFmpeg bị kill giữa
    # chừng KHÔNG để lại file _recut.mp4 hỏng (mà skip-existing tưởng đã xong).
    # GIỮ đuôi gốc (.mp4) để ffmpeg suy ra muxer — '.part' trơ → "Unable to
    # choose output format".
    tmp_out = out.with_suffix(f".part{out.suffix}")

    def assemble(vcodec_args: list[str]) -> list[str]:
        cmd = ["ffmpeg", "-y", "-i", str(src), *audio_inputs]
        if fc:
            cmd += ["-filter_complex", ";".join(fc)]
        cmd += ["-map", vmap, "-map", amap, *vcodec_args]
        cmd += ["-c:a", "aac", "-b:a", "192k", str(tmp_out)]
        return cmd

    # B17 — bitrate theo ĐỘ PHÂN GIẢI (8M cứng làm 4K vỡ, 480p phí). x264 dùng
    # CRF (đã độc-lập-độ-phân-giải). NVENC dùng -b:v scale theo chiều cao.
    def _target_bitrate(h: int) -> str:
        if h >= 2000:
            return "40M"  # 4K
        if h >= 1300:
            return "18M"  # 1440p
        if h >= 1000:
            return "10M"  # 1080p
        if h >= 700:
            return "6M"  # 720p
        return "3M"  # ≤480p

    vbit = _target_bitrate(H) if H else "8M"
    nvenc_args = [
        "-c:v", "h264_nvenc", "-preset", "p4",
        "-b:v", vbit, "-maxrate", vbit, "-bufsize", vbit,
    ]
    x264_args = ["-c:v", "libx264", "-crf", "20", "-preset", "medium"]

    log.info("recut_ffmpeg", applied=applied, nvenc=use_nvenc)
    encoder = "nvenc" if use_nvenc else "x264"
    proc = subprocess.run(
        assemble(nvenc_args if use_nvenc else x264_args), capture_output=True, text=True
    )
    # B1 — NVENC fail (driver/không có/đầy session) → fallback CPU libx264. Tránh
    # cả batch 3000 chết vì 1 vấn đề encoder.
    if proc.returncode != 0 and use_nvenc:
        log.warning("nvenc_failed_fallback_x264", err=proc.stderr[-300:])
        encoder = "x264(fallback)"
        applied.append("cpu_fallback")
        proc = subprocess.run(assemble(x264_args), capture_output=True, text=True)

    if proc.returncode != 0:
        with contextlib.suppress(OSError):
            tmp_out.unlink(missing_ok=True)
        return {
            "ok": False, "out_path": str(out), "duration_sec": probe["duration"],
            "audio_changed": audio_changed, "applied": applied,
            "elapsed_ms": int((time.time() - t0) * 1000),
            "error": proc.stderr[-600:],
        }

    # rename atomic .part → out
    try:
        os.replace(str(tmp_out), str(out))
    except OSError as e:
        return {
            "ok": False, "out_path": str(out), "duration_sec": probe["duration"],
            "audio_changed": audio_changed, "applied": applied,
            "elapsed_ms": int((time.time() - t0) * 1000),
            "error": f"rename .part lỗi: {e}",
        }

    out_dur = _ffprobe(str(out))["duration"] if out.exists() else 0.0
    applied.append(f"enc:{encoder}")
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

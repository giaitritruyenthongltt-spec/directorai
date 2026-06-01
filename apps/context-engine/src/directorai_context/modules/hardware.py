"""Hardware probe — detect GPU + memory + CPU at sidecar start.

Sprint A.5: pick model variants based on what's available.
"""

from __future__ import annotations

import platform
import shutil
import subprocess
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class GpuInfo:
    available: bool
    name: str = ""
    vram_gb: float = 0.0
    cuda_version: str = ""
    driver_version: str = ""


@dataclass(frozen=True)
class HardwareReport:
    platform: str
    arch: str
    cpu_count: int
    ram_gb: float
    gpu: GpuInfo
    ffmpeg_available: bool
    recommended_mode: str  # "gpu" | "cpu" | "minimal"

    def to_dict(self) -> dict[str, object]:
        return {
            "platform": self.platform,
            "arch": self.arch,
            "cpu_count": self.cpu_count,
            "ram_gb": round(self.ram_gb, 1),
            "gpu": asdict(self.gpu),
            "ffmpeg_available": self.ffmpeg_available,
            "recommended_mode": self.recommended_mode,
        }


def _detect_nvidia() -> GpuInfo:
    """Use nvidia-smi if installed. Returns empty GpuInfo on any failure."""
    smi = shutil.which("nvidia-smi")
    if smi is None:
        return GpuInfo(available=False)
    try:
        out = subprocess.check_output(
            [
                smi,
                "--query-gpu=name,memory.total,driver_version",
                "--format=csv,noheader,nounits",
            ],
            stderr=subprocess.DEVNULL,
            timeout=5,
        ).decode("utf-8", errors="ignore")
        line = out.strip().splitlines()[0]
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 3:
            return GpuInfo(available=False)
        name, mem_mb, driver = parts
        # CUDA version is separate query
        try:
            cuda_out = subprocess.check_output(
                [smi, "--query-gpu=driver_version", "--format=csv,noheader"],
                stderr=subprocess.DEVNULL,
                timeout=5,
            ).decode("utf-8", errors="ignore")
            cuda_version = cuda_out.strip().splitlines()[0]
        except Exception:  # noqa: BLE001
            cuda_version = ""
        return GpuInfo(
            available=True,
            name=name,
            vram_gb=int(mem_mb) / 1024 if mem_mb.isdigit() else 0.0,
            cuda_version=cuda_version,
            driver_version=driver,
        )
    except Exception:  # noqa: BLE001
        return GpuInfo(available=False)


def _ram_gb() -> float:
    """Total system RAM in GB. Falls back to 8 GB if detection fails."""
    try:
        import psutil  # type: ignore[import-untyped]

        return psutil.virtual_memory().total / (1024**3)
    except ImportError:
        # psutil isn't a required dep — degrade gracefully
        if platform.system() == "Windows":
            try:
                out = subprocess.check_output(
                    ["wmic", "ComputerSystem", "get", "TotalPhysicalMemory"],
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                ).decode("utf-8", errors="ignore")
                bytes_str = next(
                    (l.strip() for l in out.splitlines() if l.strip().isdigit()), ""
                )
                if bytes_str:
                    return int(bytes_str) / (1024**3)
            except Exception:  # noqa: BLE001
                pass
        return 8.0


def _cpu_count() -> int:
    import os

    return os.cpu_count() or 4


def probe() -> HardwareReport:
    """Build the full HardwareReport. Safe to call at startup."""
    gpu = _detect_nvidia()
    ram = _ram_gb()
    ffmpeg = shutil.which("ffmpeg") is not None

    # Recommend mode based on what we found.
    if gpu.available and gpu.vram_gb >= 6 and ram >= 16:
        mode = "gpu"
    elif ram >= 8 and _cpu_count() >= 4:
        mode = "cpu"
    else:
        mode = "minimal"

    return HardwareReport(
        platform=platform.system(),
        arch=platform.machine(),
        cpu_count=_cpu_count(),
        ram_gb=ram,
        gpu=gpu,
        ffmpeg_available=ffmpeg,
        recommended_mode=mode,
    )

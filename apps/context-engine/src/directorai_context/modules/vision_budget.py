"""LF8 — Ngân sách Vision: cap số clip gọi Gemini Vision khi mẻ quá lớn.

Quét 413 clip = 413 lần gọi Vision (đắt + chậm + dễ chạm rate-limit). Khi vượt
cap, LẤY MẪU ĐỀU theo thời gian (giữ phủ đầu→cuối phim) thay vì cắt đuôi. Luôn
TRẢ số clip bị bỏ để caller log minh bạch (không cắt im lặng).
"""

from __future__ import annotations


def sample_for_vision(paths: list[str], cap: int | None) -> tuple[list[str], int]:
    """Trả (danh_sách_lấy_mẫu, số_clip_bỏ).

    - cap None hoặc <=0 hoặc >= len → giữ nguyên (bỏ 0).
    - Ngược lại lấy `cap` clip rải ĐỀU theo chỉ số (giữ phủ toàn timeline),
      luôn gồm clip đầu và cuối.
    """
    n = len(paths)
    if not cap or cap <= 0 or cap >= n:
        return list(paths), 0
    if cap == 1:
        return [paths[0]], n - 1
    # cap mốc đều trên [0, n-1], làm tròn, khử trùng giữ thứ tự.
    step = (n - 1) / (cap - 1)
    idxs = sorted({round(i * step) for i in range(cap)})
    sampled = [paths[i] for i in idxs]
    return sampled, n - len(sampled)

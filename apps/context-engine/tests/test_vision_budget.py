"""LF8 — Test lấy mẫu Vision budget (thuần)."""

from __future__ import annotations

from directorai_context.modules.vision_budget import sample_for_vision


def test_no_cap_keeps_all() -> None:
    paths = [f"{i}.mp4" for i in range(10)]
    out, dropped = sample_for_vision(paths, None)
    assert out == paths
    assert dropped == 0


def test_cap_larger_than_list_keeps_all() -> None:
    paths = [f"{i}.mp4" for i in range(5)]
    out, dropped = sample_for_vision(paths, 100)
    assert out == paths
    assert dropped == 0


def test_even_sampling_includes_first_and_last() -> None:
    paths = [f"{i}.mp4" for i in range(100)]
    out, dropped = sample_for_vision(paths, 10)
    assert len(out) == 10
    assert dropped == 90
    assert out[0] == "0.mp4"
    assert out[-1] == "99.mp4"
    # giữ thứ tự thời gian
    nums = [int(p.split(".")[0]) for p in out]
    assert nums == sorted(nums)


def test_cap_one_keeps_first() -> None:
    paths = [f"{i}.mp4" for i in range(10)]
    out, dropped = sample_for_vision(paths, 1)
    assert out == ["0.mp4"]
    assert dropped == 9

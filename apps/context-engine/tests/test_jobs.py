"""Sprint A.4 — Job queue tests.

Cover submit/get/cancel/events lifecycle.
"""

from __future__ import annotations

import time

import pytest

from directorai_context.jobs import JobNotFound, get_queue
from directorai_context.jobs import queue as queue_mod


@pytest.fixture(autouse=True)
def fresh_queue() -> None:
    queue_mod.reset_for_tests()
    yield
    queue_mod.reset_for_tests()


def test_submit_and_wait_done() -> None:
    q = get_queue()

    def work(ctx) -> dict[str, int]:  # type: ignore[no-untyped-def]
        return {"answer": 42}

    job_id = q.submit(work, label="quick")
    info = q.wait(job_id, timeout=5)
    assert info.status == "done"
    assert info.result == {"answer": 42}
    assert info.progress == 1.0


def test_progress_updates() -> None:
    q = get_queue()
    progresses: list[float] = []

    def work(ctx) -> str:  # type: ignore[no-untyped-def]
        for i in range(5):
            ctx.set_progress((i + 1) / 5, message=f"step {i}")
            progresses.append((i + 1) / 5)
            time.sleep(0.005)
        return "ok"

    job_id = q.submit(work, label="progress")
    info = q.wait(job_id, timeout=5)
    assert info.status == "done"
    assert info.progress == 1.0
    assert progresses == [0.2, 0.4, 0.6, 0.8, 1.0]


def test_cancel_running_job() -> None:
    q = get_queue()
    started = [False]

    def slow(ctx) -> str:  # type: ignore[no-untyped-def]
        started[0] = True
        for _ in range(100):
            if ctx.cancelled:
                return "cancelled-by-ctx"
            time.sleep(0.02)
        return "ran-to-completion"

    job_id = q.submit(slow, label="slow")
    # Wait until job is actually running
    for _ in range(50):
        if started[0]:
            break
        time.sleep(0.01)
    assert q.cancel(job_id) is True
    info = q.wait(job_id, timeout=3)
    assert info.status == "cancelled"


def test_error_captured() -> None:
    q = get_queue()

    def boom(ctx) -> None:  # type: ignore[no-untyped-def]
        raise RuntimeError("kaboom")

    job_id = q.submit(boom, label="boom")
    info = q.wait(job_id, timeout=5)
    assert info.status == "error"
    assert info.error is not None and "kaboom" in info.error


def test_unknown_job_id() -> None:
    q = get_queue()
    with pytest.raises(JobNotFound):
        q.get("nope-not-real")
    with pytest.raises(JobNotFound):
        q.cancel("nope")


def test_list_contains_all_jobs() -> None:
    q = get_queue()

    def fast(ctx) -> int:  # type: ignore[no-untyped-def]
        return 1

    ids = [q.submit(fast, label=f"j{i}") for i in range(3)]
    for jid in ids:
        q.wait(jid, timeout=3)
    all_jobs = q.list()
    assert {j.id for j in all_jobs} == set(ids)
    assert all(j.status == "done" for j in all_jobs)


@pytest.mark.asyncio
async def test_async_event_stream() -> None:
    """async events() should yield snapshot + progress + terminal."""
    q = get_queue()

    def work(ctx) -> str:  # type: ignore[no-untyped-def]
        for i in range(3):
            ctx.set_progress((i + 1) / 3, message=f"s{i}")
            time.sleep(0.01)
        return "done"

    job_id = q.submit(work, label="event-stream")

    events: list[dict] = []  # type: ignore[type-arg]
    async for evt in q.events(job_id):
        events.append(evt)

    # Must contain at least snapshot + terminal status. Progress events
    # may race the worker — accept either 0 or N intermediate events.
    assert events[0]["type"] == "snapshot"
    assert events[-1].get("terminal") is True
    assert events[-1]["status"] == "done"

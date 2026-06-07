"""In-process job queue with progress + cancel.

API contract
============

    q = get_queue()
    job_id = q.submit(my_callable, args=(...), kwargs={...}, label="analyze")
    info = q.get(job_id)           # JobInfo (status, progress, result, error)
    q.cancel(job_id)               # cooperative; the callable must check
                                   # ctx.cancelled periodically
    async for evt in q.events(job_id):  # async iter of progress events
        ...

The callable receives a JobContext as its FIRST positional argument:

    def my_work(ctx: JobContext, *args, **kwargs) -> dict:
        for i in range(100):
            if ctx.cancelled:
                return {"cancelled_at": i}
            ctx.set_progress(i / 100, message=f"step {i}")
        return {"ok": True}

Internally jobs run in a ThreadPoolExecutor — fine for IO-bound work
(file reads, ffmpeg calls, HTTP). For pure-Python CPU-heavy ML the
caller should use multiprocessing.Pool or spawn a subprocess and let
this queue just await the result handle.
"""

from __future__ import annotations

import asyncio
import contextlib
import threading
import time
import traceback
import uuid
from collections.abc import AsyncIterator, Callable
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from directorai_context.logger import log

JobStatus = Literal["pending", "running", "done", "error", "cancelled"]


class JobNotFound(KeyError):
    """Raised when get_queue().get(unknown_id) is called."""


@dataclass
class JobInfo:
    """Public snapshot of a job's state."""

    id: str
    label: str
    status: JobStatus
    progress: float  # 0.0 - 1.0
    message: str
    started_at: float | None
    finished_at: float | None
    result: Any = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class JobContext:
    """Passed to every job callable as the first argument."""

    job_id: str
    _cancel_event: threading.Event = field(default_factory=threading.Event)
    _progress_callback: Callable[[float, str], None] | None = None

    @property
    def cancelled(self) -> bool:
        return self._cancel_event.is_set()

    def set_progress(self, fraction: float, message: str = "") -> None:
        """Update progress 0.0-1.0 + optional message. Safe to spam."""
        fraction = max(0.0, min(1.0, fraction))
        if self._progress_callback is not None:
            self._progress_callback(fraction, message)


class _JobEntry:
    """Internal mutable state for one job — guarded by the queue's lock."""

    def __init__(self, job_id: str, label: str) -> None:
        self.info = JobInfo(
            id=job_id,
            label=label,
            status="pending",
            progress=0.0,
            message="",
            started_at=None,
            finished_at=None,
        )
        self.context = JobContext(job_id=job_id)
        self.future: Future[Any] | None = None
        # Async event sources — each subscribed listener gets its own queue.
        self.listeners: set[asyncio.Queue[dict[str, Any]]] = set()
        self.loop: asyncio.AbstractEventLoop | None = None


class JobQueue:
    """Thread-safe in-process job runner."""

    def __init__(self, max_workers: int = 4) -> None:
        self._jobs: dict[str, _JobEntry] = {}
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._lock = threading.Lock()

    # ─── Public API ────────────────────────────────────────────────────

    def submit(
        self,
        fn: Callable[..., Any],
        *,
        args: tuple[Any, ...] = (),
        kwargs: dict[str, Any] | None = None,
        label: str = "",
    ) -> str:
        """Schedule fn(ctx, *args, **kwargs) on the worker pool."""
        job_id = uuid.uuid4().hex[:12]
        entry = _JobEntry(job_id=job_id, label=label or fn.__name__)
        # Try to capture the current running event loop so we can dispatch
        # progress events back to async listeners. Not all callers run under
        # asyncio (e.g. pure unit tests) — in that case we just skip the
        # async fan-out.
        try:
            entry.loop = asyncio.get_running_loop()
        except RuntimeError:
            entry.loop = None
        entry.context._progress_callback = lambda f, m: self._on_progress(entry, f, m)
        with self._lock:
            self._jobs[job_id] = entry
        entry.future = self._executor.submit(
            self._run_job, entry, fn, args, kwargs or {}
        )
        log.info("job_submitted", job_id=job_id, label=entry.info.label)
        return job_id

    def get(self, job_id: str) -> JobInfo:
        with self._lock:
            entry = self._jobs.get(job_id)
        if entry is None:
            raise JobNotFound(job_id)
        return entry.info

    def list(self) -> list[JobInfo]:
        with self._lock:
            return [e.info for e in self._jobs.values()]

    def cancel(self, job_id: str) -> bool:
        """Cooperative cancel. Returns True if the job was still running."""
        with self._lock:
            entry = self._jobs.get(job_id)
        if entry is None:
            raise JobNotFound(job_id)
        if entry.info.status in ("done", "error", "cancelled"):
            return False
        entry.context._cancel_event.set()
        log.info("job_cancel_requested", job_id=job_id)
        return True

    async def events(self, job_id: str) -> AsyncIterator[dict[str, Any]]:
        """Async iterator of progress/status events for the given job.

        Replays the current snapshot first, then streams live updates. Stops
        when the job reaches a terminal state.
        """
        with self._lock:
            entry = self._jobs.get(job_id)
        if entry is None:
            raise JobNotFound(job_id)

        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        entry.listeners.add(q)
        try:
            # Emit current state immediately.
            yield {"type": "snapshot", "job": entry.info.to_dict()}
            if entry.info.status in ("done", "error", "cancelled"):
                return
            while True:
                evt = await q.get()
                yield evt
                if evt.get("terminal"):
                    return
        finally:
            entry.listeners.discard(q)

    def wait(self, job_id: str, timeout: float | None = None) -> JobInfo:
        """Block until the job reaches a terminal state. Sync helper for tests."""
        with self._lock:
            entry = self._jobs.get(job_id)
        if entry is None:
            raise JobNotFound(job_id)
        if entry.future is None:
            return entry.info
        with contextlib.suppress(Exception):
            # error already captured in entry.info
            entry.future.result(timeout=timeout)
        return entry.info

    def shutdown(self) -> None:
        """Stop the worker pool. Used by tests."""
        self._executor.shutdown(wait=True, cancel_futures=True)

    # ─── Internal ──────────────────────────────────────────────────────

    def _run_job(
        self,
        entry: _JobEntry,
        fn: Callable[..., Any],
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
    ) -> None:
        with self._lock:
            entry.info.status = "running"
            entry.info.started_at = time.time()
        self._broadcast(entry, {"type": "status", "status": "running"})
        try:
            result = fn(entry.context, *args, **kwargs)
            if entry.context.cancelled:
                with self._lock:
                    entry.info.status = "cancelled"
                    entry.info.finished_at = time.time()
                self._broadcast(
                    entry,
                    {"type": "status", "status": "cancelled", "terminal": True},
                )
                return
            with self._lock:
                entry.info.status = "done"
                entry.info.result = result
                entry.info.progress = 1.0
                entry.info.finished_at = time.time()
            self._broadcast(
                entry,
                {"type": "status", "status": "done", "result": result, "terminal": True},
            )
            log.info("job_done", job_id=entry.info.id, label=entry.info.label)
        except Exception as e:
            tb = traceback.format_exc()
            with self._lock:
                entry.info.status = "error"
                entry.info.error = str(e)
                entry.info.finished_at = time.time()
            self._broadcast(
                entry,
                {"type": "status", "status": "error", "error": str(e), "terminal": True},
            )
            log.error("job_error", job_id=entry.info.id, error=str(e), traceback=tb)

    def _on_progress(self, entry: _JobEntry, fraction: float, message: str) -> None:
        with self._lock:
            entry.info.progress = fraction
            entry.info.message = message
        self._broadcast(
            entry,
            {"type": "progress", "progress": fraction, "message": message},
        )

    def _broadcast(self, entry: _JobEntry, event: dict[str, Any]) -> None:
        """Fan-out to all async listeners. Threadsafe."""
        if not entry.listeners or entry.loop is None:
            return
        # Snapshot listeners under lock; the actual put is via the loop.
        with self._lock:
            listeners = list(entry.listeners)
        for q in listeners:
            with contextlib.suppress(RuntimeError):
                # loop is closed — listener will never receive; drop quietly
                entry.loop.call_soon_threadsafe(q.put_nowait, event)


# ─── Module-level singleton ─────────────────────────────────────────────

_queue: JobQueue | None = None


def get_queue() -> JobQueue:
    global _queue
    if _queue is None:
        _queue = JobQueue(max_workers=4)
    return _queue


def reset_for_tests() -> None:
    """Tear down the queue so the next get_queue() makes a fresh one."""
    global _queue
    if _queue is not None:
        _queue.shutdown()
    _queue = None

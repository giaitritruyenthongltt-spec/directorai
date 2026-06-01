"""Sprint A.4 — Background job queue.

Lightweight in-process job runner. Lets the sidecar accept "start analysis
on 413 clips" via HTTP and stream progress over WS without blocking the
HTTP request.

Why not Celery / RQ:
  - Single-user / single-machine target — no Redis broker needed
  - Lower deps + faster boot
  - Easier to ship in the same uv environment

If we ever need multi-worker we swap the in-process executor for RQ
without changing the public API.
"""

from directorai_context.jobs.queue import (
    JobInfo,
    JobNotFound,
    JobQueue,
    JobStatus,
    get_queue,
)

__all__ = ["JobInfo", "JobNotFound", "JobQueue", "JobStatus", "get_queue"]

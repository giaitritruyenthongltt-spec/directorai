"""High-level CRUD helpers on top of SQLAlchemy.

Routes / job code should use these instead of touching Session directly so
that the actual queries are easy to test in isolation and easy to swap if
we ever move away from SQLite.
"""

from __future__ import annotations

import datetime as dt
import os
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from directorai_context.storage.db import session as session_cm
from directorai_context.storage.models import Analysis, Clip, DirectorPlan, StyleProfile


# ─── Clips ──────────────────────────────────────────────────────────────


def upsert_clip(
    path: str,
    *,
    size_bytes: int | None = None,
    duration_sec: float | None = None,
    width: int | None = None,
    height: int | None = None,
    fps: float | None = None,
    codec: str | None = None,
    s: Session | None = None,
) -> Clip:
    """Insert-or-update a clip by (path, size_bytes).

    If size is None, stat() the file on disk. Touches `last_seen`.
    """
    if size_bytes is None:
        size_bytes = os.path.getsize(path) if os.path.exists(path) else 0

    def _do(sess: Session) -> Clip:
        existing = sess.execute(
            select(Clip).where(Clip.path == path, Clip.size_bytes == size_bytes)
        ).scalar_one_or_none()
        if existing is not None:
            existing.last_seen = dt.datetime.now(dt.UTC)
            if duration_sec is not None:
                existing.duration_sec = duration_sec
            if width is not None:
                existing.width = width
            if height is not None:
                existing.height = height
            if fps is not None:
                existing.fps = fps
            if codec is not None:
                existing.codec = codec
            return existing
        clip = Clip(
            path=path,
            filename=os.path.basename(path),
            size_bytes=size_bytes,
            duration_sec=duration_sec,
            width=width,
            height=height,
            fps=fps,
            codec=codec,
        )
        sess.add(clip)
        sess.flush()
        return clip

    if s is not None:
        return _do(s)
    with session_cm() as sess:
        return _do(sess)


def get_clip(clip_id: int, *, s: Session | None = None) -> Clip | None:
    def _do(sess: Session) -> Clip | None:
        return sess.get(Clip, clip_id)

    if s is not None:
        return _do(s)
    with session_cm() as sess:
        return _do(sess)


def list_clips(limit: int = 100, offset: int = 0) -> list[Clip]:
    with session_cm() as sess:
        rows = sess.execute(
            select(Clip).order_by(Clip.id.desc()).limit(limit).offset(offset)
        ).scalars().all()
        return list(rows)


def count_clips() -> int:
    with session_cm() as sess:
        result = sess.execute(select(func.count()).select_from(Clip)).scalar_one()
        return int(result)


# ─── Analyses ───────────────────────────────────────────────────────────


def add_analysis(
    clip_id: int,
    kind: str,
    *,
    score: float | None = None,
    payload: dict[str, Any] | None = None,
    model_version: str = "v1",
    s: Session | None = None,
) -> Analysis:
    def _do(sess: Session) -> Analysis:
        a = Analysis(
            clip_id=clip_id,
            kind=kind,
            score=score,
            payload=payload or {},
            model_version=model_version,
        )
        sess.add(a)
        sess.flush()
        return a

    if s is not None:
        return _do(s)
    with session_cm() as sess:
        return _do(sess)


def latest_analysis(clip_id: int, kind: str) -> Analysis | None:
    with session_cm() as sess:
        return sess.execute(
            select(Analysis)
            .where(Analysis.clip_id == clip_id, Analysis.kind == kind)
            .order_by(Analysis.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()


# ─── Style profiles ─────────────────────────────────────────────────────


def save_style_profile(
    name: str, persona: str, payload: dict[str, Any]
) -> StyleProfile:
    with session_cm() as sess:
        existing = sess.execute(
            select(StyleProfile).where(StyleProfile.name == name)
        ).scalar_one_or_none()
        if existing is not None:
            existing.persona = persona
            existing.payload = payload
            existing.updated_at = dt.datetime.now(dt.UTC)
            return existing
        prof = StyleProfile(name=name, persona=persona, payload=payload)
        sess.add(prof)
        sess.flush()
        return prof


def list_style_profiles() -> list[StyleProfile]:
    with session_cm() as sess:
        return list(
            sess.execute(select(StyleProfile).order_by(StyleProfile.name)).scalars().all()
        )


# ─── Director plans ─────────────────────────────────────────────────────


def save_plan(
    title: str,
    goal_text: str,
    persona: str,
    plan_json: dict[str, Any],
) -> DirectorPlan:
    with session_cm() as sess:
        plan = DirectorPlan(
            title=title,
            goal_text=goal_text,
            persona=persona,
            plan_json=plan_json,
        )
        sess.add(plan)
        sess.flush()
        return plan


def update_plan_status(plan_id: int, status: str, current_step: int) -> None:
    with session_cm() as sess:
        plan = sess.get(DirectorPlan, plan_id)
        if plan is None:
            raise ValueError(f"DirectorPlan {plan_id} not found")
        plan.status = status
        plan.current_step = current_step
        plan.updated_at = dt.datetime.now(dt.UTC)


# ─── Stats (for /storage/stats endpoint) ────────────────────────────────


def stats() -> dict[str, int]:
    with session_cm() as sess:
        return {
            "clips": int(
                sess.execute(select(func.count()).select_from(Clip)).scalar_one()
            ),
            "analyses": int(
                sess.execute(select(func.count()).select_from(Analysis)).scalar_one()
            ),
            "style_profiles": int(
                sess.execute(
                    select(func.count()).select_from(StyleProfile)
                ).scalar_one()
            ),
            "director_plans": int(
                sess.execute(
                    select(func.count()).select_from(DirectorPlan)
                ).scalar_one()
            ),
        }

"""SQLAlchemy ORM models — the relational schema for context engine.

Keep models intentionally narrow: anything embedding-heavy lives in ChromaDB.
This DB is for metadata, scores, plans, and audit logs.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import (
    JSON,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Common base — gives us .metadata for create_all + Alembic autogenerate."""

    type_annotation_map = {dict[str, Any]: JSON}


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


class Clip(Base):
    """One row per known media file. Path + size acts as natural key."""

    __tablename__ = "clips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fps: Mapped[float | None] = mapped_column(Float, nullable=True)
    codec: Mapped[str | None] = mapped_column(String(32), nullable=True)
    first_seen: Mapped[dt.datetime] = mapped_column(default=_now, nullable=False)
    last_seen: Mapped[dt.datetime] = mapped_column(default=_now, nullable=False)

    analyses: Mapped[list[Analysis]] = relationship(
        back_populates="clip",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("path", "size_bytes", name="uq_clip_path_size"),
        Index("ix_clips_filename", "filename"),
    )

    def __repr__(self) -> str:
        return f"<Clip id={self.id} {self.filename!r}>"


class Analysis(Base):
    """Result of an analysis pass on a clip. One Clip can have multiple
    (different model versions / different analyzer kinds)."""

    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clip_id: Mapped[int] = mapped_column(
        ForeignKey("clips.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    """e.g. 'quality', 'scene_classify', 'aesthetic', 'audio', 'transcript'."""

    model_version: Mapped[str] = mapped_column(String(64), nullable=False, default="v1")
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now, nullable=False)

    clip: Mapped[Clip] = relationship(back_populates="analyses")

    __table_args__ = (
        Index("ix_analyses_clip_kind", "clip_id", "kind"),
        Index("ix_analyses_kind_created", "kind", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Analysis id={self.id} clip={self.clip_id} kind={self.kind!r}>"


class StyleProfile(Base):
    """User-saved editing style (Sprint E will populate via style learning)."""

    __tablename__ = "style_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    persona: Mapped[str] = mapped_column(String(32), nullable=False, default="cinematic")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now, nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(default=_now, nullable=False)


class DirectorPlan(Base):
    """Generated AI Director plans + execution state (Sprint E)."""

    __tablename__ = "director_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    goal_text: Mapped[str] = mapped_column(String(2000), nullable=False)
    persona: Mapped[str] = mapped_column(String(32), nullable=False)
    plan_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    """draft | running | paused | done | cancelled | error"""
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(default=_now, nullable=False)
    updated_at: Mapped[dt.datetime] = mapped_column(default=_now, nullable=False)

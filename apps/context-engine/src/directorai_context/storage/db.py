"""Database engine, session, and auto-init.

For internal-team deployments we keep everything single-user and local:
SQLite WAL mode is fast enough for hundreds of thousands of rows and the
file lives alongside the user's other DirectorAI data under %APPDATA% /
$XDG_DATA_HOME so it survives plugin reloads but is per-account.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from directorai_context.logger import log

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _default_db_path() -> Path:
    """OS-appropriate per-user data dir, isolated from source tree."""
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    target = base / "DirectorAI" / "context.db"
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def _resolve_db_url() -> str:
    """Pick the SQLite location.

    Env override `DIRECTORAI_DB_URL` wins (used by tests + CI). Otherwise
    the per-user default path.
    """
    override = os.environ.get("DIRECTORAI_DB_URL")
    if override:
        return override
    path = _default_db_path()
    return f"sqlite:///{path}"


def _enable_wal(engine: Engine) -> None:
    """SQLite-specific tuning: WAL + sane defaults."""

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_connection: object, _record: object) -> None:
        cur = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()


def get_engine() -> Engine:
    """Lazy-create the singleton engine. Always returns the same one."""
    global _engine, _SessionLocal
    if _engine is None:
        url = _resolve_db_url()
        _engine = create_engine(
            url,
            echo=False,
            future=True,
            # SQLite is single-writer; keep one connection per thread.
            connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
        )
        if url.startswith("sqlite"):
            _enable_wal(_engine)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, future=True)
        log.info("db_engine_created", url=_redact(url))
    return _engine


def _redact(url: str) -> str:
    """Hide password if any — SQLite has none so this is mostly future-proofing."""
    if "@" not in url:
        return url
    head, tail = url.split("://", 1)
    return f"{head}://***@{tail.split('@', 1)[1]}"


def init_db() -> None:
    """Create tables for the current models if they don't exist.

    This is the dev-friendly path. Production should use `alembic upgrade head`,
    but for a fresh single-user install this is fine and the migration system
    treats CREATE-from-models as the v0001 baseline.
    """
    from directorai_context.storage.models import Base

    engine = get_engine()
    Base.metadata.create_all(engine)
    # Mark schema version so alembic doesn't try to recreate later.
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS alembic_version "
                "(version_num VARCHAR(32) PRIMARY KEY)"
            )
        )
        existing = conn.execute(text("SELECT version_num FROM alembic_version")).first()
        if existing is None:
            conn.execute(
                text("INSERT INTO alembic_version (version_num) VALUES ('0001')")
            )
    log.info("db_initialised")


@contextmanager
def session() -> Generator[Session, None, None]:
    """Context-managed Session with auto-commit on success, rollback on error."""
    if _SessionLocal is None:
        get_engine()
    assert _SessionLocal is not None
    s = _SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def reset_for_tests() -> None:
    """Tear down the engine so the next call picks up a new DIRECTORAI_DB_URL."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None

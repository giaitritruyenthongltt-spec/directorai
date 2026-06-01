"""Sprint A.3 — Persistent storage layer.

Two backing stores:
  - SQLite (this module) for relational metadata (clips, analyses, plans, ...)
  - ChromaDB (modules/embeddings.py) for vector embeddings (already wired)

Public surface:
  - db.get_engine() / db.session() — SQLAlchemy primitives
  - models.* — ORM models
  - repositories.* — high-level CRUD wrappers

Migrations live in apps/context-engine/alembic/ and are applied via
`uv run alembic upgrade head`. The first run also happens automatically
the first time `db.get_engine()` is called against a fresh DB file.
"""

from directorai_context.storage import models, repositories
from directorai_context.storage.db import (
    get_engine,
    init_db,
    session,
)

__all__ = ["get_engine", "init_db", "session", "models", "repositories"]

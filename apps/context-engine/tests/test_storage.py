"""Sprint A.3 — Storage layer tests.

These run against a temp SQLite DB so they don't touch the real user data.
"""

from __future__ import annotations

import tempfile
import time
from pathlib import Path

import pytest

from directorai_context.storage import db as db_mod
from directorai_context.storage import repositories as repo
from directorai_context.storage.models import Analysis, Clip


@pytest.fixture(autouse=True)
def temp_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """Point storage at a throwaway file per test."""
    with tempfile.TemporaryDirectory() as tmp:
        url = f"sqlite:///{Path(tmp) / 'test.db'}"
        monkeypatch.setenv("DIRECTORAI_DB_URL", url)
        db_mod.reset_for_tests()
        db_mod.init_db()
        yield
        db_mod.reset_for_tests()


def test_init_creates_tables() -> None:
    """After init_db, all model tables should exist."""
    from sqlalchemy import inspect

    engine = db_mod.get_engine()
    names = set(inspect(engine).get_table_names())
    assert "clips" in names
    assert "analyses" in names
    assert "style_profiles" in names
    assert "director_plans" in names
    assert "alembic_version" in names


def test_upsert_clip_inserts_then_updates() -> None:
    clip1 = repo.upsert_clip(
        "C:/footage/a.mp4",
        size_bytes=1024,
        duration_sec=12.5,
        width=1920,
        height=1080,
        fps=30.0,
        codec="hevc",
    )
    assert clip1.id is not None
    assert clip1.filename == "a.mp4"

    # Same path+size → update, not duplicate.
    clip2 = repo.upsert_clip(
        "C:/footage/a.mp4", size_bytes=1024, duration_sec=13.0
    )
    assert clip2.id == clip1.id
    assert clip2.duration_sec == 13.0

    # Different size → new row.
    clip3 = repo.upsert_clip("C:/footage/a.mp4", size_bytes=2048)
    assert clip3.id != clip1.id

    assert repo.count_clips() == 2


def test_add_and_latest_analysis() -> None:
    clip = repo.upsert_clip("C:/footage/b.mp4", size_bytes=100)

    a1 = repo.add_analysis(
        clip.id, kind="quality", score=72.5, payload={"blur": 0.2, "exposure": 0.6}
    )
    assert a1.id is not None
    # ensure different created_at — analyses sort by created_at
    time.sleep(0.01)
    a2 = repo.add_analysis(clip.id, kind="quality", score=80.0, payload={"version": 2})

    latest = repo.latest_analysis(clip.id, "quality")
    assert latest is not None
    assert latest.id == a2.id
    assert latest.score == 80.0
    assert latest.payload["version"] == 2


def test_save_style_profile_upsert() -> None:
    p1 = repo.save_style_profile(
        "MyVlog", "cinematic", {"avg_clip_duration": 2.3, "fav_lut": "warm"}
    )
    p2 = repo.save_style_profile(
        "MyVlog", "cinematic", {"avg_clip_duration": 3.0}
    )
    assert p1.id == p2.id
    assert p2.payload["avg_clip_duration"] == 3.0
    assert len(repo.list_style_profiles()) == 1


def test_save_and_update_plan() -> None:
    plan = repo.save_plan(
        title="Rough cut Đà Lạt",
        goal_text="Travel vlog 3 phút",
        persona="cinematic",
        plan_json={"steps": [{"id": 1, "tool": "context.scanClips"}]},
    )
    assert plan.id is not None
    assert plan.status == "draft"
    assert plan.current_step == 0

    repo.update_plan_status(plan.id, "running", 1)
    repo.update_plan_status(plan.id, "done", 1)

    # Refetch — confirm persisted.
    with db_mod.session() as s:
        from sqlalchemy import select

        from directorai_context.storage.models import DirectorPlan

        refetched = s.execute(select(DirectorPlan)).scalar_one()
        assert refetched.status == "done"
        assert refetched.current_step == 1


def test_stats_endpoint_data() -> None:
    clip = repo.upsert_clip("C:/x.mp4", size_bytes=100)
    repo.add_analysis(clip.id, kind="quality", score=50.0)
    repo.save_style_profile("test", "vlog", {})
    repo.save_plan("t", "g", "cinematic", {})

    s = repo.stats()
    assert s == {
        "clips": 1,
        "analyses": 1,
        "style_profiles": 1,
        "director_plans": 1,
    }


def test_bulk_insert_100_clips_fast() -> None:
    """Acceptance: 100 inserts < 1 second."""
    start = time.perf_counter()
    with db_mod.session() as s:
        for i in range(100):
            repo.upsert_clip(
                f"C:/footage/bulk-{i}.mp4",
                size_bytes=1024 * (i + 1),
                duration_sec=float(i),
                s=s,
            )
    elapsed = time.perf_counter() - start
    assert repo.count_clips() == 100
    assert elapsed < 1.0, f"100 inserts took {elapsed:.2f}s (target <1s)"


def test_cascade_delete_analyses() -> None:
    """Deleting a clip should drop its analyses (FK cascade)."""
    clip = repo.upsert_clip("C:/y.mp4", size_bytes=10)
    for kind in ("quality", "aesthetic", "audio"):
        repo.add_analysis(clip.id, kind=kind, score=50.0)

    with db_mod.session() as s:
        c = s.get(Clip, clip.id)
        assert c is not None
        s.delete(c)

    with db_mod.session() as s:
        from sqlalchemy import select

        remaining = s.execute(
            select(Analysis).where(Analysis.clip_id == clip.id)
        ).all()
        assert remaining == []

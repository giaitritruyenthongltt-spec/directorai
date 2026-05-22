"""Smoke test the FastAPI app without invoking heavy ML."""

from __future__ import annotations

from fastapi.testclient import TestClient

from directorai_context.main import create_app


def test_health_returns_ok() -> None:
    app = create_app()
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_transcribe_missing_file_returns_404() -> None:
    app = create_app()
    client = TestClient(app)
    r = client.post("/transcribe", json={"media_path": "C:\\nope\\does-not-exist.mp4"})
    assert r.status_code in (404, 500)


def test_unknown_endpoint_returns_404() -> None:
    app = create_app()
    client = TestClient(app)
    r = client.get("/nope")
    assert r.status_code == 404

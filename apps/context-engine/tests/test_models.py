"""Test Pydantic model schemas."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from directorai_context.models import (
    IngestRequest,
    Scene,
    SceneResult,
    TranscribeRequest,
    TranscribeSegment,
    WordTimestamp,
)


def test_transcribe_request_minimal() -> None:
    req = TranscribeRequest(media_path="C:\\test.mp4")
    assert req.media_path == "C:\\test.mp4"
    assert req.language is None


def test_word_timestamp_default_probability() -> None:
    w = WordTimestamp(text="hello", start=0.0, end=0.5)
    assert w.probability == 1.0


def test_transcribe_segment_words_optional() -> None:
    seg = TranscribeSegment(id=0, start=0, end=1, text="hi")
    assert seg.words == []


def test_scene_result() -> None:
    sr = SceneResult(
        media_path="x.mp4",
        scenes=[Scene(index=0, start=0.0, end=5.0, duration=5.0)],
    )
    assert sr.scenes[0].duration == 5.0


def test_ingest_request_defaults() -> None:
    req = IngestRequest(media_path="x.mp4")
    assert req.enable_transcribe is True
    assert req.enable_scene is True
    assert req.enable_beat is False
    assert req.enable_vision is False


def test_ingest_request_rejects_missing_path() -> None:
    with pytest.raises(ValidationError):
        IngestRequest()  # type: ignore[call-arg]

"""Pydantic models — the wire format of the context engine API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class TranscribeRequest(BaseModel):
    """Request to transcribe an audio/video file."""

    media_path: str = Field(..., description="Absolute path to media file")
    language: str | None = Field(None, description="ISO-639 code, e.g. 'en', 'vi'")


class WordTimestamp(BaseModel):
    """A single word with its time range."""

    text: str
    start: float
    end: float
    probability: float = 1.0


class TranscribeSegment(BaseModel):
    """A larger segment of speech with optional word-level timestamps."""

    id: int
    start: float
    end: float
    text: str
    words: list[WordTimestamp] = []


class TranscribeResult(BaseModel):
    """Full transcription result."""

    media_path: str
    language: str
    duration_sec: float
    segments: list[TranscribeSegment]


class SceneRequest(BaseModel):
    """Request to detect scene cuts."""

    media_path: str
    threshold: float | None = None
    min_scene_len_sec: float | None = None


class Scene(BaseModel):
    """A detected scene boundary."""

    index: int
    start: float
    end: float
    duration: float


class SceneResult(BaseModel):
    """Scene detection result."""

    media_path: str
    scenes: list[Scene]


class BeatRequest(BaseModel):
    """Request to detect musical beats."""

    media_path: str


class BeatResult(BaseModel):
    """Beat detection result."""

    media_path: str
    tempo_bpm: float
    beats_sec: list[float]


class VisionRequest(BaseModel):
    """Request to analyze sampled frames with vision LLM."""

    media_path: str
    sample_interval_sec: float | None = None


class VisionTag(BaseModel):
    """A single frame analysis result."""

    time: float
    caption: str
    tags: list[str]


class VisionResult(BaseModel):
    """Vision analysis result."""

    media_path: str
    frames: list[VisionTag]


class IngestRequest(BaseModel):
    """Request to run the full ingest pipeline."""

    media_path: str
    enable_transcribe: bool = True
    enable_scene: bool = True
    enable_beat: bool = False
    enable_vision: bool = False


class IngestResult(BaseModel):
    """Aggregated context.json output."""

    media_path: str
    duration_sec: float
    transcribe: TranscribeResult | None = None
    scenes: SceneResult | None = None
    beats: BeatResult | None = None
    vision: VisionResult | None = None

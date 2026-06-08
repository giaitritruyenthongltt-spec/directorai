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
    # 'content' (ngưỡng cố định) | 'adaptive' (rolling-avg, bền chuyển động)
    detector: str | None = None
    threshold: float | None = None  # cho ContentDetector
    adaptive_threshold: float | None = None  # cho AdaptiveDetector
    min_scene_len_sec: float | None = None
    thumbnails: bool = False  # kèm ảnh xem-trước (data-URI) mỗi cảnh để duyệt cắt
    thumb_width: int | None = None
    group: bool = False  # gom shot→cảnh ngữ-nghĩa (histogram màu shot kề nhau)
    group_threshold: float | None = None  # 0..1, cao = gộp ít (nhiều nhóm hơn)
    semantic: bool = False  # A3 — gán nhãn ngữ-nghĩa từng nhóm (Gemini Vision)


class Scene(BaseModel):
    """A detected scene boundary."""

    index: int
    start: float
    end: float
    duration: float
    thumb: str | None = None  # 'data:image/jpeg;base64,...' (nếu xin thumbnails)


class SceneGroup(BaseModel):
    """Nhóm CẢNH ngữ-nghĩa = gộp nhiều shot kề nhau giống nhau (cùng bối cảnh)."""

    index: int
    start: float
    end: float
    duration: float
    shot_indices: list[int]  # các shot (cảnh) thành viên
    shot_count: int
    label: str | None = None  # A3 — nhãn ngữ-nghĩa (Gemini Vision), vd "phục kích"


class SceneResult(BaseModel):
    """Scene detection result."""

    media_path: str
    scenes: list[Scene]
    detector: str = "content"  # phương pháp đã dùng
    fps: float = 0.0
    groups: list[SceneGroup] = []  # gom shot→cảnh ngữ-nghĩa (nếu xin group)


class AudioSeparateRequest(BaseModel):
    """Tách stem audio bằng Demucs (tách nhạc nền / voice)."""

    media_path: str
    model: str = "htdemucs"
    # 'vocals' (2-stem: vocals + no_vocals) hoặc '4stem'
    mode: str = "vocals"


class AudioSeparateResult(BaseModel):
    ok: bool
    out_dir: str
    stems: dict[str, str]  # {'vocals': path, 'no_vocals': path, ...}
    device: str
    elapsed_ms: int
    cached: bool = False  # True nếu tái dùng stems cache (không chạy lại Demucs)


class RecutRecipe(BaseModel):
    """Công thức chống-trùng (FFmpeg + Demucs)."""

    flip: bool = False  # lật ngang (hflip) — phá pHash
    crop_pct: float = 0.0  # zoom-crop % (0..10) — đổi khung hình
    reframe: bool = False  # A1 — crop hướng về chủ thể (YOLO) thay vì giữa khung
    speed: float = 1.0  # đổi tốc độ video (0.9..1.15) + atempo audio
    saturation: float = 1.0  # eq saturation
    brightness: float = 0.0  # eq brightness (-0.1..0.1)
    contrast: float = 1.0  # A5 — eq contrast (0.9..1.1)
    gamma: float = 1.0  # A5 — eq gamma (0.9..1.1)
    hue_deg: float = 0.0  # A5 — xoay hue (độ, -30..30) — đổi tông màu, phá Content-ID màu
    grain: float = 0.0  # noise cường độ (0..20)
    # A7 — chống "reused content": xoá metadata nguồn + gắn title/comment riêng.
    strip_metadata: bool = True
    title: str | None = None
    comment: str | None = None
    # B2 — dọn stems Demucs sau render (tránh phình cache khi batch 3000 tập).
    cleanup_stems: bool = False
    # BGM: keep | strip (bỏ nhạc, giữ voice) | replace (voice + nhạc mới)
    bgm: str = "keep"
    new_bgm_path: str | None = None
    bgm_gain_db: float = -6.0


class RecutRenderRequest(BaseModel):
    video_path: str
    out_path: str | None = None  # mặc định: <video>_recut.mp4
    recipe: RecutRecipe = RecutRecipe()
    use_nvenc: bool = True
    job_id: str | None = None  # B1 — đăng ký để hủy giữa-render


class RecutCancelRequest(BaseModel):
    job_id: str


class RecutRenderResult(BaseModel):
    ok: bool
    out_path: str
    duration_sec: float
    audio_changed: bool
    applied: list[str]
    elapsed_ms: int
    error: str | None = None
    cancelled: bool = False  # B1 — bị hủy giữa-render


class ProbeRequest(BaseModel):
    """Đọc thông số media (cho cut-list FCPXML / batch)."""

    media_path: str


class ProbeResult(BaseModel):
    width: int
    height: int
    fps: float
    duration: float
    has_audio: bool


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


class VideoMapRequest(BaseModel):
    """AI-2 — Request gộp nhiều clip thành bản đồ video (Tầng 3)."""

    clip_paths: list[str]
    goal: str | None = None
    sample_interval_sec: float | None = None
    # LF8 — cap số clip gọi Vision (lấy mẫu đều khi vượt). None = không giới hạn.
    max_vision_clips: int | None = None


class EditPlanRequest(BaseModel):
    """AI-3 — Request lập kế hoạch edit từ clip + mục tiêu (Tầng 4)."""

    clip_paths: list[str]
    goal: str
    sample_interval_sec: float | None = None
    # LF1 — tham số phim dài (optional → không truyền thì giữ hành vi cũ).
    target_duration_sec: float | None = None
    keep_ratio: float | None = None
    pacing_profile: str | None = None
    structure: str | None = None  # "3act" | "chapters" | "recap"
    # LF8 — cap số clip gọi Vision (lấy mẫu đều khi vượt). None = không giới hạn.
    max_vision_clips: int | None = None


class OrderRequest(BaseModel):
    """A2 — Request gợi ý THỨ TỰ dựng clip theo mạch phim."""

    clip_paths: list[str]
    goal: str | None = None


class SpeedAnalyzeRequest(BaseModel):
    """SPEED P1 — Request phân tích tín hiệu tốc độ (motion/fps) từng clip."""

    clip_paths: list[str]
    samples: int = 12


class SpeedPlanRequest(BaseModel):
    """SPEED P2 — Request QUYẾT tốc độ từng clip (analyze + plan từ phân bố thật)."""

    clip_paths: list[str]
    samples: int = 12
    mode: str = "content"  # content | normalize | music | duration
    p_lo: float = 20.0  # percentile ngưỡng tua-nhanh (≤ p_lo → speed-up)
    p_hi: float = 80.0  # percentile ngưỡng slow-mo (≥ p_hi → slow-mo)
    min_speed: float = 0.5  # clamp ⊂ [0.5, 2.0]
    max_speed: float = 2.0
    slowmo_floor: float = 0.5  # slow-mo mạnh nhất (cảnh động nhất)
    speedup_ceiling: float = 2.0  # tua nhanh nhất (cảnh tĩnh nhất)
    target_motion: float = 0.0  # mode normalize: motion mục tiêu (0 = auto = trung vị)
    smooth_fps: float = 50.0  # fps-gate: dưới mức này slow-mo mạnh bị giới hạn
    slowmo_fps_floor: float = 0.8  # slow-mo nhẹ nhất cho clip fps thấp
    target_duration_sec: float = 0.0  # mode duration: tổng thời lượng mục tiêu


class DeadAirRequest(BaseModel):
    """LF4 — Request cắt dead-air/khoảng lặng đầu-cuối từng clip."""

    clip_paths: list[str]
    min_silence_sec: float = 1.0
    keep_padding_sec: float = 0.25
    threshold_db: float = -40.0
    disable_if_silent_ratio: float = 0.85
    min_kept_sec: float = 0.5


class FilterBadRequest(BaseModel):
    """MOD-3 — Request lọc clip kém (CV prefilter → Vision subset)."""

    clip_paths: list[str]
    threshold: float = 0.5
    sample_interval_sec: float | None = None


class ClusterRequest(BaseModel):
    """COST-1 — Request gom clip gần giống (perceptual hash)."""

    clip_paths: list[str]
    max_distance: int = 6


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


# ─── Embeddings / Search ───────────────────────────────────────────────────


class EmbedRequest(BaseModel):
    """Request to embed an already-computed IngestResult."""

    ingest: IngestResult


class EmbedResult(BaseModel):
    """Embedding indexing result."""

    media_path: str
    indexed_count: int


class SearchRequest(BaseModel):
    """Top-K semantic search over the indexed corpus."""

    query: str
    top_k: int = Field(10, ge=1, le=100)
    media_path: str | None = None
    kind: str | None = Field(None, description="transcript | vision | scene")


class SearchHit(BaseModel):
    """One result row from a search."""

    id: str
    text: str
    media_path: str
    kind: str
    start: float
    end: float
    score: float


class SearchResult(BaseModel):
    """Search response."""

    query: str
    hits: list[SearchHit]


class ProjectContext(BaseModel):
    """Aggregated metadata for a Premiere project — written to disk."""

    project_id: str
    project_name: str
    media: dict[str, IngestResult] = Field(default_factory=dict)
    embeddings_count: int = 0
    updated_at: str = ""

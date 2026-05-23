/**
 * Aggregated context for a Premiere project — what the Style Engine and
 * the Cut Planner consume. Persisted to disk by the context-engine
 * service at `<cache_dir>/projects/<projectId>/context.json`.
 *
 * Shape mirrors the Python `IngestResult` + `ProjectContext` models in
 * apps/context-engine/src/directorai_context/models.py so both sides
 * can serialize/deserialize the same JSON.
 */
import type { Seconds } from './time.js';

export interface ClipSegment {
  readonly id: number;
  readonly start: Seconds;
  readonly end: Seconds;
  readonly text: string;
  readonly isFiller?: boolean;
  readonly isSilence?: boolean;
}

export interface TranscribeContext {
  readonly mediaPath: string;
  readonly language: string;
  readonly durationSec: Seconds;
  readonly segments: readonly ClipSegment[];
}

export interface SceneBoundary {
  readonly index: number;
  readonly start: Seconds;
  readonly end: Seconds;
  readonly duration: Seconds;
}

export interface SceneContext {
  readonly mediaPath: string;
  readonly scenes: readonly SceneBoundary[];
}

export interface BeatContext {
  readonly mediaPath: string;
  readonly tempoBpm: number;
  readonly beatsSec: readonly Seconds[];
}

export interface VisionFrame {
  readonly time: Seconds;
  readonly caption: string;
  readonly tags: readonly string[];
}

export interface VisionContext {
  readonly mediaPath: string;
  readonly frames: readonly VisionFrame[];
}

export interface MediaContext {
  readonly mediaPath: string;
  readonly durationSec: Seconds;
  readonly transcribe?: TranscribeContext;
  readonly scenes?: SceneContext;
  readonly beats?: BeatContext;
  readonly vision?: VisionContext;
}

export interface ProjectContext {
  readonly projectId: string;
  readonly projectName: string;
  readonly media: Readonly<Record<string, MediaContext>>;
  readonly embeddingsCount: number;
  readonly updatedAt: string;
}

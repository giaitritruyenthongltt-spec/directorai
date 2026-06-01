import type {
  Project,
  Sequence,
  Clip,
  Track,
  Effect,
  Marker,
  Seconds,
  TimeRange,
} from '@directorai/core';

export interface ApplyEffectInput {
  clipId: string;
  effectMatchName: string;
}

export interface AddMarkerInput {
  sequenceId: string;
  time: Seconds;
  name: string;
  comment?: string;
  color?: string;
}

export interface CutClipInput {
  clipId: string;
  at: Seconds;
}

export interface TrimClipInput {
  clipId: string;
  newRange: TimeRange;
}

export interface MoveClipInput {
  clipId: string;
  newStart: Seconds;
  newTrackId?: string;
}

export interface ImportFileInput {
  path: string;
  binId?: string;
}

export interface ExportInput {
  sequenceId: string;
  outputPath: string;
  presetPath: string;
}

export interface KeyframeInput {
  clipId: string;
  effectId: string;
  paramName: string;
  time: Seconds;
  value: number | string | boolean;
}

/**
 * Lumetri Basic Correction param surface.
 *
 * V4 — added whites/blacks/vibrance for full 9-slider coverage. All
 * params are optional — pass only those you want to set.
 *
 * Ranges (the adapter clamps to these — out-of-range silently fails):
 *   exposure    -5..5
 *   contrast    -100..100
 *   highlights  -100..100
 *   shadows     -100..100
 *   whites      -100..100
 *   blacks      -100..100
 *   saturation  0..200
 *   vibrance    -100..100
 *   temperature -100..100
 */
export interface ColorParamsInput {
  clipId: string;
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  saturation?: number;
  vibrance?: number;
  temperature?: number;
}

export interface AudioGainInput {
  clipId: string;
  gainDb: number;
}

export interface AudioFadeInput {
  clipId: string;
  durationSec: Seconds;
  type: 'in' | 'out';
}

export interface TextOverlayInput {
  sequenceId: string;
  trackIndex: number;
  text: string;
  startTime: Seconds;
  duration: Seconds;
  font?: string;
  fontSize?: number;
}

export interface TransitionInput {
  clipIdA: string;
  clipIdB: string;
  matchName: string;
  durationSec: Seconds;
}

/**
 * The unified NLE adapter interface. Implemented by:
 *   - `MockPremiereAdapter` (kind 'mock')
 *   - `UXPPremiereAdapter`  (kind 'uxp')
 *   - `RemotePremiereAdapter` (kind 'mock' or 'uxp' transparently)
 *   - `MockDaVinciAdapter`  (kind 'davinci', P5.03b)
 *   - `DaVinciAdapter`      (kind 'davinci', P5.03c+)
 *
 * The interface is host-agnostic — every method maps cleanly to both
 * Premiere's UXP API and DaVinci's Python scripting API. Host-specific
 * concerns (e.g. UXP lockedAccess, DaVinci Python IPC) live inside
 * the implementations.
 *
 * The `kind` discriminator lets callers branch on host when the
 * surface really differs (e.g. transition naming conventions); 99%
 * of code stays host-agnostic.
 */
export interface INLEAdapter {
  readonly kind: 'mock' | 'uxp' | 'davinci';

  getProject(): Promise<Project>;
  listSequences(): Promise<readonly Sequence[]>;
  setActiveSequence(sequenceId: string): Promise<void>;
  getActiveSequence(): Promise<Sequence | null>;

  listClips(sequenceId: string): Promise<readonly Clip[]>;
  getClip(clipId: string): Promise<Clip | null>;

  cutClip(input: CutClipInput): Promise<readonly Clip[]>;
  trimClip(input: TrimClipInput): Promise<Clip>;
  moveClip(input: MoveClipInput): Promise<Clip>;
  deleteClip(clipId: string): Promise<void>;
  /** A3 — Tắt/bật clip (disable). An toàn hơn xoá; dùng cho "lọc clip kém". */
  setClipDisabled(clipId: string, disabled: boolean): Promise<void>;

  listTracks(sequenceId: string): Promise<readonly Track[]>;

  applyEffect(input: ApplyEffectInput): Promise<Effect>;
  removeEffect(clipId: string, effectId: string): Promise<void>;

  importFile(input: ImportFileInput): Promise<{ id: string; path: string }>;

  addMarker(input: AddMarkerInput): Promise<Marker>;
  listMarkers(sequenceId: string): Promise<readonly Marker[]>;
  deleteMarker(sequenceId: string, markerId: string): Promise<void>;

  exportSequence(input: ExportInput): Promise<{ jobId: string }>;

  addKeyframe(input: KeyframeInput): Promise<void>;
  applyColorPreset(clipId: string, presetName: string): Promise<void>;
  setColorParams(input: ColorParamsInput): Promise<void>;

  setAudioGain(input: AudioGainInput): Promise<void>;
  addAudioFade(input: AudioFadeInput): Promise<void>;
  muteTrack(sequenceId: string, trackId: string, muted: boolean): Promise<void>;

  addTextOverlay(input: TextOverlayInput): Promise<{ clipId: string }>;

  applyTransition(input: TransitionInput): Promise<void>;
  listTransitions(): Promise<readonly { matchName: string; displayName: string }[]>;

  beginUndoGroup(label: string): Promise<void>;
  endUndoGroup(): Promise<void>;
}

/**
 * @deprecated since 1.3.0 — use `INLEAdapter` instead.
 *
 * Kept as an alias so the existing v1.x callers (panel, server, cut
 * planner, dispatcher, plugins) keep compiling without a sweep. Will
 * be removed in v2.0.0 (2-minor-version deprecation, per
 * `docs/guides/sdk-versioning.md`).
 *
 * The alias is intentionally a `type` not a re-export so its
 * `.kind` field is still the broader `'mock' | 'uxp' | 'davinci'`
 * union — callers can keep narrowing as before.
 */
export type IPremiereAdapter = INLEAdapter;

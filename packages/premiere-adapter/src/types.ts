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

export interface ColorParamsInput {
  clipId: string;
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  saturation?: number;
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

export interface IPremiereAdapter {
  readonly kind: 'mock' | 'uxp';

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

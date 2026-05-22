import type { Seconds, TimeRange } from './time.js';
import type { Effect } from './effect.js';

export type ClipKind = 'video' | 'audio' | 'still' | 'title' | 'adjustment';

export interface MediaSource {
  readonly path: string;
  readonly duration: Seconds;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
}

export interface Clip {
  readonly id: string;
  readonly name: string;
  readonly kind: ClipKind;
  readonly trackId: string;
  readonly timelineRange: TimeRange;
  readonly sourceRange: TimeRange;
  readonly source: MediaSource;
  readonly effects: readonly Effect[];
  readonly enabled: boolean;
}

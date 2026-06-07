import type { Seconds, TimeRange } from './time.js';
import type { Effect } from './effect.js';
import type { ClipMetadata } from './narrative.js';

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
  /** DM1 — metadata phân tích (Vision/CV), optional để tương thích ngược. */
  readonly metadata?: ClipMetadata;
}

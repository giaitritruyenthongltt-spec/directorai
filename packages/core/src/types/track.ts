import type { Clip } from './clip.js';

export type TrackKind = 'video' | 'audio';

export interface Track {
  readonly id: string;
  readonly index: number;
  readonly kind: TrackKind;
  readonly name: string;
  readonly muted: boolean;
  readonly locked: boolean;
  readonly clips: readonly Clip[];
}

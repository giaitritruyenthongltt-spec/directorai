import type { Clip } from './clip.js';

export type TrackKind = 'video' | 'audio';

/**
 * DM1 — Vai trò ngữ nghĩa của track (phim dài thường có nhiều audio track).
 * Suy ra từ tên track / heuristic; optional vì Premiere không lộ trực tiếp.
 */
export type TrackRole = 'video' | 'music' | 'dialog' | 'sfx' | 'ambient' | 'voiceover';

export interface Track {
  readonly id: string;
  readonly index: number;
  readonly kind: TrackKind;
  readonly name: string;
  readonly muted: boolean;
  readonly locked: boolean;
  readonly clips: readonly Clip[];
  /** DM1 — vai trò ngữ nghĩa (optional, suy ra từ tên/heuristic). */
  readonly role?: TrackRole;
}

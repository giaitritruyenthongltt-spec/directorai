import type { FrameRate, Seconds } from './time.js';
import type { Track } from './track.js';
import type { Marker } from './marker.js';
import type { Chapter, Segment } from './narrative.js';

export interface SequenceSettings {
  readonly width: number;
  readonly height: number;
  readonly frameRate: FrameRate;
  readonly sampleRate: number;
}

export interface Sequence {
  readonly id: string;
  readonly name: string;
  readonly duration: Seconds;
  readonly settings: SequenceSettings;
  readonly tracks: readonly Track[];
  readonly markers: readonly Marker[];
  /** DM1 — chương (act) của phim dài, optional. Ánh xạ chapter-marker. */
  readonly chapters?: readonly Chapter[];
  /** DM1 — đoạn (segment có mục đích tự sự), do AI sinh, optional. */
  readonly segments?: readonly Segment[];
}

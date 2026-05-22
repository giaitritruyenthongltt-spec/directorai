import type { FrameRate, Seconds } from './time.js';
import type { Track } from './track.js';
import type { Marker } from './marker.js';

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
}

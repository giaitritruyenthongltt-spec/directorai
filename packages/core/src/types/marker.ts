import type { Seconds } from './time.js';

export type MarkerKind = 'comment' | 'chapter' | 'segmentation' | 'web';

export interface Marker {
  readonly id: string;
  readonly time: Seconds;
  readonly duration: Seconds;
  readonly kind: MarkerKind;
  readonly name: string;
  readonly comment: string;
  readonly color: string;
}

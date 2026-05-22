import { describe, it, expect, expectTypeOf } from 'vitest';
import { seconds, ms, frame, FPS_24, FPS_30, FPS_2997 } from '../types/time.js';
import type { Project } from '../types/project.js';
import type { Sequence } from '../types/sequence.js';
import type { Clip } from '../types/clip.js';
import type { Effect } from '../types/effect.js';
import type { Marker } from '../types/marker.js';
import type { Track } from '../types/track.js';

describe('time brands', () => {
  it('seconds brand wraps a number', () => {
    const t = seconds(10);
    expect(t).toBe(10);
  });
  it('ms brand wraps a number', () => {
    expect(ms(1000)).toBe(1000);
  });
  it('frame brand wraps a number', () => {
    expect(frame(48)).toBe(48);
  });
  it('FPS constants are valid', () => {
    expect(FPS_24.numerator).toBe(24);
    expect(FPS_30.numerator).toBe(30);
    expect(FPS_2997.numerator).toBe(30000);
    expect(FPS_2997.denominator).toBe(1001);
  });
});

describe('domain types are exported', () => {
  it('Project type shape', () => {
    expectTypeOf<Project>().toHaveProperty('id');
    expectTypeOf<Project>().toHaveProperty('metadata');
    expectTypeOf<Project>().toHaveProperty('sequences');
  });
  it('Sequence type shape', () => {
    expectTypeOf<Sequence>().toHaveProperty('id');
    expectTypeOf<Sequence>().toHaveProperty('tracks');
  });
  it('Clip type shape', () => {
    expectTypeOf<Clip>().toHaveProperty('timelineRange');
    expectTypeOf<Clip>().toHaveProperty('source');
  });
  it('Track / Effect / Marker exist', () => {
    expectTypeOf<Track>().toHaveProperty('clips');
    expectTypeOf<Effect>().toHaveProperty('matchName');
    expectTypeOf<Marker>().toHaveProperty('time');
  });
});

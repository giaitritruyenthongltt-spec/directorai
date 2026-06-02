/**
 * C1 — Test reorder ripple-aware: thứ tự đích đúng + KHÔNG chồng lấn.
 */

import { describe, it, expect } from 'vitest';
import type { Clip } from '@directorai/core';
import { applyMovesToOrder, computeReorderOps } from '../reorder.js';

function clip(id: string, start: number, dur: number): Clip {
  return {
    id,
    name: id,
    kind: 'video',
    trackId: 'video-1',
    timelineRange: { start, end: start + dur },
    sourceRange: { start: 0, end: dur },
    source: { path: `${id}.mp4`, duration: dur, hasVideo: true, hasAudio: false },
    effects: [],
    enabled: true,
  };
}

/** Mô phỏng áp ops lên clips (như mock.moveClip) rồi kiểm chồng lấn. */
function simulate(clips: Clip[], ops: { clipId: string; newStart: number }[]): Clip[] {
  const byId = new Map(clips.map((c) => [c.id, { ...c, timelineRange: { ...c.timelineRange } }]));
  for (const op of ops) {
    const c = byId.get(op.clipId)!;
    const d = c.timelineRange.end - c.timelineRange.start;
    c.timelineRange = { start: op.newStart, end: op.newStart + d };
  }
  return [...byId.values()].sort((a, b) => a.timelineRange.start - b.timelineRange.start);
}

function hasOverlap(clips: Clip[]): boolean {
  const s = [...clips].sort((a, b) => a.timelineRange.start - b.timelineRange.start);
  for (let i = 1; i < s.length; i++) {
    if (s[i]!.timelineRange.start < s[i - 1]!.timelineRange.end - 1e-9) return true;
  }
  return false;
}

describe('applyMovesToOrder', () => {
  it('đưa clip tới index đích (array-move)', () => {
    expect(applyMovesToOrder(['a', 'b', 'c'], [{ clipId: 'a', toIndex: 2 }])).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
  it('bỏ qua clip không tồn tại', () => {
    expect(applyMovesToOrder(['a', 'b'], [{ clipId: 'z', toIndex: 0 }])).toEqual(['a', 'b']);
  });
});

describe('computeReorderOps', () => {
  const clips = [clip('a', 0, 5), clip('b', 5, 3), clip('c', 8, 4)];

  it('thứ tự không đổi → 0 ops', () => {
    expect(computeReorderOps(clips, [{ clipId: 'a', toIndex: 0 }])).toEqual([]);
  });

  it('re-pack đúng thứ tự đích, KHÔNG chồng lấn, contiguous', () => {
    // đưa a xuống cuối: b,c,a
    const ops = computeReorderOps(clips, [{ clipId: 'a', toIndex: 2 }]);
    expect(ops.length).toBe(6); // 3 park + 3 place
    const after = simulate(clips, ops);
    expect(hasOverlap(after)).toBe(false);
    // thứ tự cuối theo start: b(0-3), c(3-7), a(7-12)
    expect(after.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(after[0]!.timelineRange.start).toBe(0); // giữ blockStart
    // dán liền: end của clip trước = start clip sau
    expect(after[1]!.timelineRange.start).toBe(after[0]!.timelineRange.end);
    expect(after[2]!.timelineRange.start).toBe(after[1]!.timelineRange.end);
  });

  it('nhiều move + giữ thời lượng từng clip', () => {
    const ops = computeReorderOps(clips, [
      { clipId: 'c', toIndex: 0 },
      { clipId: 'a', toIndex: 2 },
    ]);
    const after = simulate(clips, ops);
    expect(hasOverlap(after)).toBe(false);
    // c(4s), b(3s), a(5s) → giữ đúng độ dài
    const cClip = after.find((x) => x.id === 'c')!;
    expect(cClip.timelineRange.end - cClip.timelineRange.start).toBe(4);
  });
});

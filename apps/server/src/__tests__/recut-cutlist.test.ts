/** R4 — scenesToRecutTimeline: cut-list → FcpTimeline editable (hàm thuần). */
import { describe, it, expect } from 'vitest';
import { scenesToRecutTimeline } from '../director-tools.js';

const PROBE = { width: 1920, height: 1080, fps: 30, duration: 100, hasAudio: true };

describe('scenesToRecutTimeline', () => {
  const scenes = [
    { startSec: 0, durationSec: 3 },
    { startSec: 3, durationSec: 5 },
    { startSec: 8, durationSec: 2 },
  ];

  it('maps each scene to one editable clip at its source in-point', () => {
    const tl = scenesToRecutTimeline('D:/v.mp4', scenes, PROBE, 'Recut — v');
    expect(tl.clips).toHaveLength(3);
    expect(tl.name).toBe('Recut — v');
    expect(tl.fps).toBe(30);
    expect(tl.width).toBe(1920);
    // sourceInSec giữ đúng điểm cắt gốc
    expect(tl.clips.map((c) => c.sourceInSec)).toEqual([0, 3, 8]);
    // mọi clip trỏ về cùng 1 nguồn
    expect(tl.clips.every((c) => c.assetPath === 'D:/v.mp4')).toBe(true);
  });

  it('places clips sequentially (cumulative timelineStart, no gaps/overlap)', () => {
    const tl = scenesToRecutTimeline('D:/v.mp4', scenes, PROBE);
    expect(tl.clips.map((c) => c.timelineStartSec)).toEqual([0, 3, 8]);
    // start[i+1] === start[i] + duration[i]
    for (let i = 1; i < tl.clips.length; i++) {
      const prev = tl.clips[i - 1]!;
      expect(tl.clips[i]!.timelineStartSec).toBeCloseTo(prev.timelineStartSec + prev.durationSec);
    }
  });

  it('falls back to sane defaults when probe is empty', () => {
    const tl = scenesToRecutTimeline('D:/v.mp4', scenes, {
      width: 0,
      height: 0,
      fps: 0,
      duration: 0,
      hasAudio: false,
    });
    expect(tl.fps).toBe(30);
    expect(tl.width).toBe(1920);
    expect(tl.height).toBe(1080);
  });

  it('names clips Cảnh 1..N and carries hasAudio', () => {
    const tl = scenesToRecutTimeline('D:/v.mp4', scenes, PROBE);
    expect(tl.clips.map((c) => c.name)).toEqual(['Cảnh 1', 'Cảnh 2', 'Cảnh 3']);
    expect(tl.clips.every((c) => c.hasAudio === true)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildFcpxml,
  secondsToRational,
  pathToFileUri,
  splitClip,
  type FcpTimeline,
  type FcpClip,
} from '../index.js';

const baseClip: FcpClip = {
  assetPath: 'E:\\T11\\6.mp4',
  name: '6',
  timelineStartSec: 0,
  sourceInSec: 0,
  durationSec: 5,
  assetDurationSec: 10,
};

function tl(clips: FcpClip[]): FcpTimeline {
  return { name: 'Test', fps: 30, width: 1920, height: 1080, clips };
}

describe('fcpxml generate', () => {
  it('secondsToRational dùng fps frames', () => {
    expect(secondsToRational(1, 30)).toBe('30/30s');
    expect(secondsToRational(0.5, 30)).toBe('15/30s');
  });

  it('pathToFileUri xử lý Windows path', () => {
    expect(pathToFileUri('E:\\T11\\6.mp4')).toBe('file:///E:/T11/6.mp4');
  });

  it('buildFcpxml hợp lệ + gom asset 1 lần dù dùng nhiều', () => {
    const xml = buildFcpxml(
      tl([
        baseClip,
        { ...baseClip, timelineStartSec: 5, name: '6b' }, // cùng asset
        { ...baseClip, assetPath: 'E:\\T11\\7.mp4', name: '7', timelineStartSec: 10 },
      ])
    );
    expect(xml).toContain('<!DOCTYPE fcpxml>');
    expect(xml).toContain('<fcpxml version="1.9">');
    // 2 asset (6.mp4 + 7.mp4), không phải 3
    expect((xml.match(/<asset id=/g) ?? []).length).toBe(2);
    // 3 asset-clip trên spine
    expect((xml.match(/<asset-clip /g) ?? []).length).toBe(3);
    expect(xml).toContain('file:///E:/T11/6.mp4');
  });

  it('speed sinh timeMap', () => {
    const xml = buildFcpxml(tl([{ ...baseClip, speed: 0.5 }]));
    expect(xml).toContain('<timeMap>');
    expect(xml).toContain('interp="smooth2"');
  });

  it('marker sinh đúng', () => {
    const xml = buildFcpxml(tl([{ ...baseClip, markers: [{ startSec: 2, name: 'Hit' }] }]));
    expect(xml).toContain('<marker ');
    expect(xml).toContain('value="Hit"');
  });

  it('escape ký tự XML đặc biệt trong tên', () => {
    const xml = buildFcpxml(tl([{ ...baseClip, name: 'A & B <x>' }]));
    expect(xml).toContain('A &amp; B &lt;x&gt;');
    expect(xml).not.toContain('A & B <x>');
  });

  it('splitClip tách đúng in/out + vị trí', () => {
    const [a, b] = splitClip(baseClip, 2);
    expect(a.durationSec).toBe(2);
    expect(b.timelineStartSec).toBe(2);
    expect(b.sourceInSec).toBe(2);
    expect(b.durationSec).toBe(3);
  });
});

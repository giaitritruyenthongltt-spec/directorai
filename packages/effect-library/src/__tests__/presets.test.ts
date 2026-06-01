/**
 * Sprint F.5 — Style preset + LUT matcher tests.
 */
import { describe, expect, it } from 'vitest';

import {
  findStylePreset,
  isLutKeyValid,
  matchLutForClip,
  matchLutsBatch,
  STYLE_PRESETS,
  validateStylePresets,
  type ColorStats,
  type StylePreset,
} from '../index.js';

const stats = (warmth: number, brightness: number, mood: ColorStats['mood']): ColorStats => ({
  warmth,
  brightness,
  saturation: 0.5,
  mood,
});

describe('STYLE_PRESETS', () => {
  it('has all 5 required presets', () => {
    const ids = STYLE_PRESETS.map((p) => p.id).sort();
    expect(ids).toEqual(['action', 'cinematic', 'horror', 'vintage', 'vlog']);
  });

  it('every preset references valid registry keys', () => {
    const v = validateStylePresets();
    expect(v.missing).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('findStylePreset returns by id', () => {
    expect(findStylePreset('cinematic')?.label).toBe('Cinematic');
    expect(findStylePreset('action')?.transitionKey).toBe('whip_pan');
  });

  it('every preset has a summary and at least one preferredScene', () => {
    for (const p of STYLE_PRESETS) {
      expect(p.summary.length).toBeGreaterThan(10);
      expect(p.preferredScenes.length).toBeGreaterThan(0);
      expect(p.preferredMoods.length).toBeGreaterThan(0);
    }
  });
});

describe('matchLutForClip', () => {
  const cinematic = findStylePreset('cinematic') as StylePreset;
  const action = findStylePreset('action') as StylePreset;
  const horror = findStylePreset('horror') as StylePreset;
  const vlog = findStylePreset('vlog') as StylePreset;

  it('dark clip + horror → noir', () => {
    const m = matchLutForClip(horror, stats(-0.1, 0.05, 'dark'));
    expect(m.lutKey).toBe('noir_high_contrast');
  });

  it('dark clip + non-horror → desaturated film', () => {
    const m = matchLutForClip(cinematic, stats(0.1, 0.05, 'dark'));
    expect(m.lutKey).toBe('desaturated_film');
  });

  it('warm sunset clip + cinematic → sunset glow', () => {
    const m = matchLutForClip(cinematic, stats(0.7, 0.6, 'warm'));
    expect(m.lutKey).toBe('sunset_glow');
  });

  it('low-light action clip → noir contrast', () => {
    const m = matchLutForClip(action, stats(0.0, 0.2, 'cool'));
    expect(m.lutKey).toBe('noir_high_contrast');
  });

  it('warm clip + horror → cold drama (cools it)', () => {
    const m = matchLutForClip(horror, stats(0.6, 0.5, 'warm'));
    expect(m.lutKey).toBe('cold_drama');
  });

  it('bright saturated vlog → punchy', () => {
    const m = matchLutForClip(vlog, {
      warmth: 0.2,
      brightness: 0.85,
      saturation: 0.6,
      mood: 'bright',
    });
    expect(m.lutKey).toBe('punchy_vibrant');
  });

  it('default falls back to preset.colorKey', () => {
    const m = matchLutForClip(cinematic, stats(0.05, 0.5, 'neutral'));
    expect(m.lutKey).toBe(cinematic.colorKey);
    expect(m.reason).toContain('default');
  });

  it('score is always in [0, 1]', () => {
    for (const preset of STYLE_PRESETS) {
      for (const mood of ['warm', 'cool', 'neutral', 'dark', 'bright'] as const) {
        const m = matchLutForClip(preset, stats(0, 0.5, mood));
        expect(m.score).toBeGreaterThanOrEqual(0);
        expect(m.score).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('matchLutsBatch', () => {
  it('matches every clip in the input', () => {
    const cinematic = findStylePreset('cinematic') as StylePreset;
    const clips = [
      { id: 'a', color: stats(0.3, 0.6, 'warm') },
      { id: 'b', color: stats(-0.1, 0.1, 'dark') },
      { id: 'c', color: stats(0.0, 0.5, 'neutral') },
    ];
    const out = matchLutsBatch(cinematic, clips);
    expect(out).toHaveLength(3);
    expect(out.map((o) => o.clipId)).toEqual(['a', 'b', 'c']);
    for (const o of out) {
      expect(isLutKeyValid(o.match.lutKey)).toBe(true);
    }
  });
});

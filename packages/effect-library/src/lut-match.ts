/**
 * Sprint F.2 — Per-clip LUT matcher.
 *
 * Given a clip's ColorAnalysis (output of Python color.py via WS) plus a
 * global StylePreset, pick which Lumetri LUT key from registry.ts fits
 * the clip best.
 *
 * Strategy: combine the preset's preferred color with adjustments for
 * the clip's own brightness / warmth.
 */

import { findPreset } from './registry.js';
import type { StylePreset } from './presets.js';

export interface ColorStats {
  /** -1 (cool) … 1 (warm). */
  readonly warmth: number;
  /** 0-1 average value channel. */
  readonly brightness: number;
  /** 0-1 average saturation. */
  readonly saturation: number;
  readonly mood: 'warm' | 'cool' | 'neutral' | 'dark' | 'bright';
}

export interface LutMatch {
  /** EffectPreset.key from registry.ts. */
  readonly lutKey: string;
  /** 0-1 score — higher is better. */
  readonly score: number;
  /** Human-readable explanation. */
  readonly reason: string;
}

/**
 * Decide which Lumetri preset to apply to this clip.
 *
 * If the clip's color profile contradicts the global preset (e.g. style
 * is 'action' but the clip is dark/cool), we may suggest a different LUT
 * for this specific clip while keeping the global look intact.
 */
export function matchLutForClip(preset: StylePreset, clip: ColorStats): LutMatch {
  const base = preset.colorKey;

  // Dark clips never get punchy/vibrant grades — push toward warm vlog or noir
  if (clip.mood === 'dark') {
    if (preset.id === 'horror') {
      return {
        lutKey: 'noir_high_contrast',
        score: 0.85,
        reason: 'dark scene + horror style → noir',
      };
    }
    return {
      lutKey: 'desaturated_film',
      score: 0.75,
      reason: 'dark scene → desaturated film',
    };
  }

  // Very warm clips with cool-leaning preset → soften
  if (preset.id === 'horror' && clip.warmth > 0.4) {
    return {
      lutKey: 'cold_drama',
      score: 0.7,
      reason: 'overly warm clip pulled cool to match horror tone',
    };
  }
  if (preset.id === 'action' && clip.brightness < 0.3) {
    return {
      lutKey: 'noir_high_contrast',
      score: 0.78,
      reason: 'low-light action shot → noir contrast push',
    };
  }
  if (preset.id === 'cinematic' && clip.warmth > 0.6) {
    return {
      lutKey: 'sunset_glow',
      score: 0.82,
      reason: 'warm cinematic + sunset light → sunset glow',
    };
  }
  if (preset.id === 'vlog' && clip.brightness > 0.7 && clip.saturation > 0.4) {
    return {
      lutKey: 'punchy_vibrant',
      score: 0.85,
      reason: 'bright saturated vlog moment → punchy',
    };
  }

  return {
    lutKey: base,
    score: 0.9,
    reason: `default ${preset.label} grade`,
  };
}

/**
 * Cluster a batch of clips into groups that should share a LUT (Sprint F.3
 * shot matching). Cheap k-means-ish: group by (warmth bin × brightness
 * bin × mood). Returns the LUT chosen for each group.
 */
export function matchLutsBatch(
  preset: StylePreset,
  clips: readonly { id: string; color: ColorStats }[]
): readonly { clipId: string; match: LutMatch }[] {
  return clips.map((c) => ({ clipId: c.id, match: matchLutForClip(preset, c.color) }));
}

/** Confirm the chosen LUT key is real. */
export function isLutKeyValid(key: string): boolean {
  return findPreset(key) !== undefined;
}

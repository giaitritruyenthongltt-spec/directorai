/**
 * Sprint F.5 — Style presets bundle.
 *
 * Each preset is a combo of:
 *   - One Lumetri color grade from registry.ts
 *   - Default transition preference
 *   - Pacing hint
 *   - Tag set for the recommender
 *
 * The AI Director picks a preset from this list as the global "look" for
 * the project; per-clip LUT decisions (Sprint F.2 LUT matcher) refine it
 * based on each clip's color analysis.
 */

import { findPreset } from './registry.js';
import type { Mood, Pacing, SceneType } from './recommend.js';

export type PresetId = 'cinematic' | 'action' | 'vlog' | 'vintage' | 'horror';

export interface StylePreset {
  readonly id: PresetId;
  readonly label: string;
  readonly summary: string;
  /** Key of an EffectPreset in registry.ts to use as the global LUT. */
  readonly colorKey: string;
  /** Preferred transition for the bulk of cuts. */
  readonly transitionKey: string;
  /** Optional accent transition for high-energy moments. */
  readonly accentTransitionKey?: string;
  readonly pacing: Pacing;
  /** Pacing scene-types this preset particularly likes. */
  readonly preferredScenes: readonly SceneType[];
  readonly preferredMoods: readonly Mood[];
  /** Recommended audio tweaks. */
  readonly audioKeys: readonly string[];
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'cinematic',
    label: 'Cinematic',
    summary: 'Slow build, warm cinematic grade, dissolves between calm scenes, gentle film grain.',
    colorKey: 'teal_orange',
    transitionKey: 'film_dissolve',
    accentTransitionKey: 'dip_to_black',
    pacing: 'slow',
    preferredScenes: ['landscape', 'establishing', 'dialog', 'closeup'],
    preferredMoods: ['warm', 'nostalgic', 'calm', 'dreamy'],
    audioKeys: ['audio_ducking', 'audio_eq_voice'],
  },
  {
    id: 'action',
    label: 'Action',
    summary:
      'Fast cuts on beat, whip-pan transitions, punchy teal-orange grade, zoom punches on impacts.',
    colorKey: 'teal_orange',
    transitionKey: 'whip_pan',
    accentTransitionKey: 'cross_zoom',
    pacing: 'fast',
    preferredScenes: ['action', 'montage'],
    preferredMoods: ['intense', 'energetic'],
    audioKeys: ['audio_compress'],
  },
  {
    id: 'vlog',
    label: 'Vlog',
    summary:
      'Casual cuts on dialogue, bright warm grade, bold yellow captions, dissolve for travel B-roll.',
    colorKey: 'warm_vlog',
    transitionKey: 'cross_dissolve',
    pacing: 'medium',
    preferredScenes: ['dialog', 'closeup', 'establishing'],
    preferredMoods: ['warm', 'energetic'],
    audioKeys: ['audio_ducking', 'audio_denoise', 'audio_eq_voice'],
  },
  {
    id: 'vintage',
    label: 'Vintage',
    summary:
      'Soft dissolves, desaturated film stock grade, grain overlay, light leaks at scene starts.',
    colorKey: 'vintage_kodak',
    transitionKey: 'film_dissolve',
    accentTransitionKey: 'iris_round',
    pacing: 'slow',
    preferredScenes: ['establishing', 'landscape', 'closeup'],
    preferredMoods: ['nostalgic', 'warm', 'sad'],
    audioKeys: ['audio_reverb_room'],
  },
  {
    id: 'horror',
    label: 'Horror',
    summary:
      'Cold drama grade, crushed shadows, jump-cut style dip-to-blacks, occasional glitch distortion.',
    colorKey: 'cold_drama',
    transitionKey: 'dip_to_black',
    accentTransitionKey: 'glitch',
    pacing: 'slow',
    preferredScenes: ['closeup', 'establishing'],
    preferredMoods: ['tense', 'cool', 'sad'],
    audioKeys: ['audio_reverb_room'],
  },
];

export function findStylePreset(id: PresetId): StylePreset | undefined {
  return STYLE_PRESETS.find((p) => p.id === id);
}

/** Sanity check: every referenced effect key must exist in registry.ts. */
export function validateStylePresets(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const p of STYLE_PRESETS) {
    for (const k of [p.colorKey, p.transitionKey, p.accentTransitionKey, ...p.audioKeys]) {
      if (!k) continue;
      if (!findPreset(k)) missing.push(`${p.id} → ${k}`);
    }
  }
  return { ok: missing.length === 0, missing };
}

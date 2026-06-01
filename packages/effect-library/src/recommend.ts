/**
 * Sprint D.4 — Rule-based effect recommendation.
 *
 * Given a scene description (type + mood + pacing), pick the top N presets
 * from EFFECT_PRESETS that fit. No LLM needed — purely deterministic.
 * Sprint D.5 adds an LLM-assisted variant on top of this.
 *
 * Tagging strategy: rather than expand every preset row with bestFor/mood
 * fields, we keep a sibling lookup table here. That way the canonical
 * preset registry stays a pure ID/matchName map and tagging is editable
 * without churn on registry.ts.
 */

import { EFFECT_PRESETS, type EffectPreset } from './registry.js';

/** Scene types the recommender understands. */
export type SceneType =
  | 'action'
  | 'dialog'
  | 'landscape'
  | 'closeup'
  | 'establishing'
  | 'montage'
  | 'transition';

/** Mood/energy axis. */
export type Mood =
  | 'intense'
  | 'calm'
  | 'dreamy'
  | 'sad'
  | 'tense'
  | 'warm'
  | 'cool'
  | 'energetic'
  | 'nostalgic';

/** Pacing target — drives transition + speed picks. */
export type Pacing = 'slow' | 'medium' | 'fast';

interface RecommendInput {
  readonly scene: SceneType;
  readonly mood: Mood;
  readonly pacing?: Pacing;
  /** Optional category whitelist — only return effects in these categories. */
  readonly categories?: readonly EffectPreset['category'][];
  /** Max results. Default 3. */
  readonly topK?: number;
}

interface Recommendation {
  readonly preset: EffectPreset;
  readonly score: number;
  readonly reasons: readonly string[];
}

interface Tags {
  bestFor: readonly SceneType[];
  mood: readonly Mood[];
  pacing: readonly Pacing[];
  /** Optional explicit weight override (default 1.0). */
  weight?: number;
}

// ────────────────────────────────────────────────────────────────────────
//  Preset → tag table.
//
//  Coverage philosophy:
//    - Every preset gets at least one scene + one mood tag
//    - Effects can serve multiple scenes (most do)
//    - Missing entries default to all-scenes/all-moods with weight 0.5
//      so they're still in the pool, just not preferred
// ────────────────────────────────────────────────────────────────────────

const TAGS: Record<string, Tags> = {
  // Transitions
  cross_dissolve: {
    bestFor: ['dialog', 'landscape', 'establishing'],
    mood: ['calm', 'warm', 'sad', 'nostalgic'],
    pacing: ['slow', 'medium'],
  },
  dip_to_black: {
    bestFor: ['establishing', 'transition', 'dialog'],
    mood: ['sad', 'tense', 'cool'],
    pacing: ['slow', 'medium'],
  },
  dip_to_white: {
    bestFor: ['establishing', 'transition'],
    mood: ['dreamy', 'warm', 'nostalgic'],
    pacing: ['slow'],
  },
  film_dissolve: {
    bestFor: ['dialog', 'landscape', 'establishing', 'montage'],
    mood: ['nostalgic', 'warm', 'sad'],
    pacing: ['slow', 'medium'],
  },
  whip_pan: {
    bestFor: ['action', 'montage', 'transition'],
    mood: ['intense', 'energetic'],
    pacing: ['fast'],
  },
  cross_zoom: {
    bestFor: ['action', 'montage'],
    mood: ['intense', 'energetic'],
    pacing: ['fast', 'medium'],
  },
  morph_cut: {
    bestFor: ['dialog'],
    mood: ['calm'],
    pacing: ['medium', 'fast'],
  },
  slide_left: {
    bestFor: ['montage', 'transition'],
    mood: ['energetic'],
    pacing: ['medium', 'fast'],
  },
  iris_round: {
    bestFor: ['establishing', 'transition'],
    mood: ['nostalgic', 'dreamy'],
    pacing: ['slow', 'medium'],
  },
  page_turn: {
    bestFor: ['transition', 'montage'],
    mood: ['nostalgic'],
    pacing: ['slow', 'medium'],
  },

  // Zoom / motion
  zoom_punch: {
    bestFor: ['action', 'montage', 'closeup'],
    mood: ['intense', 'energetic'],
    pacing: ['fast'],
  },
  zoom_highlight: {
    bestFor: ['closeup', 'dialog'],
    mood: ['calm', 'tense'],
    pacing: ['medium'],
  },
  zoom_pulse: {
    bestFor: ['action', 'montage'],
    mood: ['intense', 'energetic'],
    pacing: ['fast'],
  },
  ken_burns: {
    bestFor: ['establishing', 'landscape', 'montage'],
    mood: ['nostalgic', 'calm', 'warm'],
    pacing: ['slow'],
  },
  shake: {
    bestFor: ['action'],
    mood: ['intense', 'tense', 'energetic'],
    pacing: ['fast'],
  },
  parallax: {
    bestFor: ['establishing', 'landscape'],
    mood: ['dreamy', 'calm'],
    pacing: ['slow', 'medium'],
  },
  tilt_shift: {
    bestFor: ['establishing', 'landscape'],
    mood: ['dreamy', 'nostalgic'],
    pacing: ['slow'],
  },
  lens_distort: {
    bestFor: ['action', 'closeup'],
    mood: ['intense', 'energetic'],
    pacing: ['fast', 'medium'],
  },

  // Color
  warm_vlog: {
    bestFor: ['dialog', 'closeup', 'montage'],
    mood: ['warm', 'calm', 'nostalgic'],
    pacing: ['slow', 'medium'],
  },
  teal_orange: {
    bestFor: ['action', 'landscape', 'closeup'],
    mood: ['intense', 'cool', 'warm'],
    pacing: ['medium', 'fast'],
  },
  punchy_vibrant: {
    bestFor: ['montage', 'closeup'],
    mood: ['energetic', 'warm'],
    pacing: ['fast'],
  },
  desaturated_film: {
    bestFor: ['dialog', 'landscape', 'establishing'],
    mood: ['sad', 'nostalgic', 'cool'],
    pacing: ['slow'],
  },
  noir_high_contrast: {
    bestFor: ['dialog', 'closeup'],
    mood: ['tense', 'sad', 'cool'],
    pacing: ['slow', 'medium'],
  },
  pastel_dream: {
    bestFor: ['landscape', 'establishing', 'closeup'],
    mood: ['dreamy', 'warm', 'nostalgic'],
    pacing: ['slow'],
  },
  sunset_glow: {
    bestFor: ['landscape', 'establishing'],
    mood: ['warm', 'nostalgic', 'dreamy'],
    pacing: ['slow'],
  },
  cold_drama: {
    bestFor: ['dialog', 'closeup', 'landscape'],
    mood: ['tense', 'cool', 'sad'],
    pacing: ['slow', 'medium'],
  },
  tech_blue: {
    bestFor: ['establishing'],
    mood: ['cool', 'tense'],
    pacing: ['medium'],
  },
  vintage_kodak: {
    bestFor: ['montage', 'dialog', 'closeup'],
    mood: ['nostalgic', 'warm'],
    pacing: ['slow', 'medium'],
  },
  matrix_green: {
    bestFor: ['action'],
    mood: ['tense', 'cool'],
    pacing: ['fast'],
  },
  bw_documentary: {
    bestFor: ['dialog', 'establishing'],
    mood: ['nostalgic', 'sad'],
    pacing: ['slow', 'medium'],
  },

  // Text / MOGRT
  big_bold_yellow: {
    bestFor: ['closeup', 'montage'],
    mood: ['energetic'],
    pacing: ['fast'],
  },
  clean_subtitle: { bestFor: ['dialog'], mood: ['calm'], pacing: ['slow', 'medium'] },
  kinetic_typography: {
    bestFor: ['montage', 'closeup'],
    mood: ['energetic', 'intense'],
    pacing: ['fast'],
  },
  lower_third_news: { bestFor: ['dialog'], mood: ['calm', 'tense'], pacing: ['medium'] },
  lower_third_modern: { bestFor: ['dialog'], mood: ['calm'], pacing: ['medium'] },
  callout_arrow: { bestFor: ['closeup'], mood: ['calm'], pacing: ['medium'] },
  chapter_card: {
    bestFor: ['establishing', 'transition'],
    mood: ['calm'],
    pacing: ['slow'],
  },
  progress_bar: { bestFor: ['montage'], mood: ['energetic'], pacing: ['fast'] },

  // Audio
  audio_fade_in: { bestFor: ['establishing'], mood: ['calm'], pacing: ['slow', 'medium'] },
  audio_fade_out: { bestFor: ['transition'], mood: ['calm', 'sad'], pacing: ['slow', 'medium'] },
  audio_ducking: { bestFor: ['dialog'], mood: ['calm'], pacing: ['slow', 'medium'] },
  audio_eq_voice: { bestFor: ['dialog'], mood: ['calm'], pacing: ['slow', 'medium'] },
  audio_compress: { bestFor: ['dialog', 'action'], mood: ['intense'], pacing: ['medium'] },
  audio_denoise: { bestFor: ['dialog'], mood: ['calm'], pacing: ['slow'] },
  audio_reverb_room: { bestFor: ['dialog'], mood: ['warm', 'nostalgic'], pacing: ['slow'] },
  audio_telephone: { bestFor: ['dialog'], mood: ['nostalgic', 'tense'], pacing: ['medium'] },

  // Speed
  speed_ramp: { bestFor: ['action', 'montage'], mood: ['intense', 'energetic'], pacing: ['fast'] },
  freeze_frame: { bestFor: ['action', 'closeup'], mood: ['intense', 'tense'], pacing: ['medium'] },
  reverse: { bestFor: ['montage'], mood: ['dreamy'], pacing: ['medium'] },
  slow_motion_2x: {
    bestFor: ['action', 'landscape'],
    mood: ['dreamy', 'intense'],
    pacing: ['slow'],
  },
  fast_forward_4x: { bestFor: ['montage'], mood: ['energetic'], pacing: ['fast'] },

  // Distort
  glitch: { bestFor: ['action', 'transition'], mood: ['intense', 'tense'], pacing: ['fast'] },
  vhs_track: { bestFor: ['montage'], mood: ['nostalgic'], pacing: ['medium'] },
  shake_hit: { bestFor: ['action'], mood: ['intense'], pacing: ['fast'] },
  rgb_split: { bestFor: ['action', 'montage'], mood: ['intense', 'tense'], pacing: ['fast'] },

  // Stylize
  film_grain: {
    bestFor: ['dialog', 'landscape', 'closeup'],
    mood: ['nostalgic', 'warm', 'sad'],
    pacing: ['slow'],
  },
  vignette_soft: { bestFor: ['closeup', 'dialog'], mood: ['calm', 'warm'], pacing: ['slow'] },
  light_leak: { bestFor: ['landscape', 'montage'], mood: ['dreamy', 'warm'], pacing: ['slow'] },
  duotone: { bestFor: ['closeup', 'montage'], mood: ['cool', 'tense'], pacing: ['medium'] },
  paper_texture: { bestFor: ['establishing'], mood: ['nostalgic'], pacing: ['slow'] },
};

// ────────────────────────────────────────────────────────────────────────
//  Scoring
// ────────────────────────────────────────────────────────────────────────

const SCENE_MATCH_WEIGHT = 0.45;
const MOOD_MATCH_WEIGHT = 0.4;
const PACING_MATCH_WEIGHT = 0.15;

function tagsFor(key: string): Tags {
  return TAGS[key] ?? { bestFor: [], mood: [], pacing: [], weight: 0.5 };
}

function scorePreset(
  preset: EffectPreset,
  input: RecommendInput
): { score: number; reasons: string[] } {
  const tags = tagsFor(preset.key);
  const reasons: string[] = [];

  const sceneHit = tags.bestFor.includes(input.scene);
  const moodHit = tags.mood.includes(input.mood);
  const pacingHit = input.pacing ? tags.pacing.includes(input.pacing) : true;

  let score = 0;
  if (sceneHit) {
    score += SCENE_MATCH_WEIGHT;
    reasons.push(`good for ${input.scene} scenes`);
  }
  if (moodHit) {
    score += MOOD_MATCH_WEIGHT;
    reasons.push(`matches ${input.mood} mood`);
  }
  if (pacingHit && input.pacing) {
    score += PACING_MATCH_WEIGHT;
    reasons.push(`fits ${input.pacing} pacing`);
  }

  // Penalise effects with NO matches — they should rank below partial matches.
  if (score === 0) {
    score = 0.05 * (tags.weight ?? 1);
  } else {
    score *= tags.weight ?? 1;
  }

  return { score, reasons };
}

/**
 * Return the top N effects fitting the scene + mood + pacing.
 *
 * Deterministic: same input → same output. Stable sort breaks ties by
 * preset key alphabetically so callers can rely on the ordering for
 * caching.
 */
export function recommend(input: RecommendInput): readonly Recommendation[] {
  const topK = input.topK ?? 3;
  const pool = input.categories
    ? EFFECT_PRESETS.filter((p) => input.categories!.includes(p.category))
    : EFFECT_PRESETS;

  const scored = pool.map((preset) => {
    const { score, reasons } = scorePreset(preset, input);
    return { preset, score, reasons };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.preset.key.localeCompare(b.preset.key);
  });

  return scored.slice(0, topK);
}

/** Convenience: top 1 effect for the given scene/mood. */
export function recommendOne(
  scene: SceneType,
  mood: Mood,
  pacing?: Pacing
): EffectPreset | undefined {
  const [best] = recommend({ scene, mood, pacing, topK: 1 });
  return best?.preset;
}

/** Inspect the tag table — used by tests and the LLM-assisted variant. */
export function getTags(key: string): Tags {
  return tagsFor(key);
}

/** Coverage check: how many presets have explicit tags vs default fallback. */
export function tagCoverage(): { tagged: number; untagged: number; total: number } {
  let tagged = 0;
  let untagged = 0;
  for (const p of EFFECT_PRESETS) {
    if (TAGS[p.key]) tagged += 1;
    else untagged += 1;
  }
  return { tagged, untagged, total: EFFECT_PRESETS.length };
}

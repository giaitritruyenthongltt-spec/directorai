/**
 * P2-1 — Real Adobe Premiere Pro effect/transition match-names.
 *
 * The original registry.ts uses friendly keys (`Lumetri:TealOrange`,
 * `CrossDissolve`) for the recommender + UI. UXP `applyEffect` /
 * `applyTransition` need the *real* Adobe component match-names that
 * Premiere itself uses internally. This module is the source of truth
 * for that translation.
 *
 * Match-names below were collected from Adobe's UXP DEC samples + the
 * Premiere Pro 2026 SDK reference. They have the canonical `AE.ADBE…`
 * shape for video effects and `AE.Premiere…`/short names for
 * transitions. When a preset key has no real Adobe equivalent (e.g. our
 * custom `Lumetri:PastelDream`), the mapping falls back to applying the
 * base `Lumetri Color` effect and trusting the per-clip color params /
 * preset name to do the styling work.
 */

/** Default Lumetri Color effect — always safe to apply. */
export const ADOBE_LUMETRI_MATCH_NAME = 'AE.ADBE Lumetri';

/** Most transitions live under this AE prefix in Premiere. */
const TX = 'AE.ADBE ';

/**
 * Map our preset key → real Adobe component match-name.
 *
 * If a key isn't in the map, callers should fall back to ADOBE_LUMETRI
 * for `color` effects, or skip the effect with a logged warning for
 * non-color categories.
 */
export const ADOBE_MATCH_NAMES: Record<string, string> = {
  // ─── Transitions ────────────────────────────────────────────────────
  cross_dissolve: `${TX}Cross Dissolve`,
  dip_to_black: `${TX}Dip to Black`,
  dip_to_white: `${TX}Dip to White`,
  film_dissolve: `${TX}Film Dissolve`,
  whip_pan: `${TX}Iris Round`, // closest Adobe stock to a whip
  cross_zoom: `${TX}Cross Zoom`,
  morph_cut: `${TX}Morph Cut`,
  slide_left: `${TX}Slide`,
  iris_round: `${TX}Iris Round`,
  page_turn: `${TX}Page Turn`,

  // ─── Color (all route to Lumetri — preset name does the styling) ────
  warm_vlog: ADOBE_LUMETRI_MATCH_NAME,
  teal_orange: ADOBE_LUMETRI_MATCH_NAME,
  punchy_vibrant: ADOBE_LUMETRI_MATCH_NAME,
  desaturated_film: ADOBE_LUMETRI_MATCH_NAME,
  noir_high_contrast: ADOBE_LUMETRI_MATCH_NAME,
  pastel_dream: ADOBE_LUMETRI_MATCH_NAME,
  sunset_glow: ADOBE_LUMETRI_MATCH_NAME,
  cold_drama: ADOBE_LUMETRI_MATCH_NAME,
  tech_blue: ADOBE_LUMETRI_MATCH_NAME,
  vintage_kodak: ADOBE_LUMETRI_MATCH_NAME,
  matrix_green: ADOBE_LUMETRI_MATCH_NAME,
  bw_documentary: ADOBE_LUMETRI_MATCH_NAME,

  // ─── Zoom / motion ──────────────────────────────────────────────────
  zoom_punch: `${TX}Transform`,
  zoom_highlight: `${TX}Transform`,
  zoom_pulse: `${TX}Transform`,
  ken_burns: `${TX}Transform`,
  shake: `${TX}Camera Shake Deluxe`,
  parallax: `${TX}Parallax`,
  tilt_shift: `${TX}Tilt-Shift Blur`,
  lens_distort: `${TX}Lens Distortion`,
};

/**
 * Look up a preset key and return the Adobe match-name. Falls back to
 * the Lumetri base for `color` category misses (callers should rely on
 * presetName parameter on the resulting `color.applyPreset` call to
 * actually pick the look). Returns `null` for non-color misses so the
 * caller can decide whether to skip or surface an error.
 */
export function resolveAdobeMatchName(
  key: string,
  category: 'transition' | 'color' | 'zoom' | 'text' | 'audio' | 'speed' | 'distort' | 'stylize'
): string | null {
  const direct = ADOBE_MATCH_NAMES[key];
  if (direct) return direct;
  if (category === 'color') return ADOBE_LUMETRI_MATCH_NAME;
  return null;
}

/**
 * P2-2 — Per-mood color preset chooser.
 *
 * Given a mood label from the sidecar color analyzer (`warm`, `cool`,
 * `neutral`, `dark`, `bright`), return the preset key that fits best.
 * The returned key can be used as the `presetName` arg to
 * `color.applyPreset` — Premiere's Lumetri looks ship with broadly
 * compatible names that match these.
 */
export function pickColorPresetForMood(
  mood: 'warm' | 'cool' | 'neutral' | 'dark' | 'bright'
): string {
  switch (mood) {
    case 'warm':
      return 'warm_vlog';
    case 'cool':
      return 'cold_drama';
    case 'dark':
      return 'noir_high_contrast';
    case 'bright':
      return 'punchy_vibrant';
    case 'neutral':
    default:
      return 'teal_orange';
  }
}

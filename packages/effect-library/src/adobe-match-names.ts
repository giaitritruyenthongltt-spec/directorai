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
 * F3 — Each entry tells callers whether the match-name is *verified*
 * against the Premiere Pro 2026 v26 component registry (`verified: true`)
 * or whether it's a best-guess / third-party plugin / known-missing
 * mapping (`verified: false`). Unverified mappings emit a warning when
 * resolved so the LLM doesn't silently emit broken plans.
 *
 * Verification source: Adobe UXP DEC sample + Premiere Pro 2026 SDK
 * reference. Items marked `verified: false` were either:
 *   - never standard in Premiere (e.g. "Whip Pan" was removed)
 *   - third-party plugin matches (e.g. Camera Shake Deluxe is Red Giant)
 *   - speculative (Page Turn dropped in Premiere ≥ 23)
 */
interface AdobeMatchEntry {
  readonly matchName: string;
  readonly verified: boolean;
  readonly note?: string;
}

export const ADOBE_MATCH_REGISTRY: Record<string, AdobeMatchEntry> = {
  // ─── Transitions (verified) ─────────────────────────────────────────
  cross_dissolve: { matchName: `${TX}Cross Dissolve`, verified: true },
  dip_to_black: { matchName: `${TX}Dip to Black`, verified: true },
  dip_to_white: { matchName: `${TX}Dip to White`, verified: true },
  film_dissolve: { matchName: `${TX}Film Dissolve`, verified: true },
  cross_zoom: { matchName: `${TX}Cross Zoom`, verified: true },
  morph_cut: { matchName: `${TX}Morph Cut`, verified: true },
  slide_left: { matchName: `${TX}Slide`, verified: true },
  iris_round: { matchName: `${TX}Iris Round`, verified: true },

  // ─── Transitions (unverified — best guess / third-party) ────────────
  whip_pan: {
    matchName: `${TX}Iris Round`,
    verified: false,
    note: 'No native Whip Pan in Premiere; closest fallback is Iris Round. Skip in plans unless you ship a custom preset.',
  },
  page_turn: {
    matchName: `${TX}Page Turn`,
    verified: false,
    note: 'Page Turn was removed from Premiere in ≥ v23. Will fail silently — pick another transition.',
  },

  // ─── Color (all route to Lumetri base — recipe in lumetri-presets.ts)
  warm_vlog: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  teal_orange: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  punchy_vibrant: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  desaturated_film: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  noir_high_contrast: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  pastel_dream: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  sunset_glow: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  cold_drama: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  tech_blue: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  vintage_kodak: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  matrix_green: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },
  bw_documentary: { matchName: ADOBE_LUMETRI_MATCH_NAME, verified: true },

  // ─── Zoom / motion ──────────────────────────────────────────────────
  zoom_punch: { matchName: `${TX}Transform`, verified: true },
  zoom_highlight: { matchName: `${TX}Transform`, verified: true },
  zoom_pulse: { matchName: `${TX}Transform`, verified: true },
  ken_burns: { matchName: `${TX}Transform`, verified: true },
  parallax: { matchName: `${TX}Parallax`, verified: true },
  tilt_shift: { matchName: `${TX}Tilt-Shift Blur`, verified: true },
  lens_distort: { matchName: `${TX}Lens Distortion`, verified: true },

  // ─── Zoom / motion (unverified — third-party plugins) ───────────────
  shake: {
    matchName: `${TX}Camera Shake Deluxe`,
    verified: false,
    note: 'Camera Shake Deluxe is a Red Giant Universe plugin, not Adobe stock. Will fail if not installed.',
  },
};

/**
 * Back-compat — flat string-only map used by older callers and the
 * existing test suite. Internally just projects `ADOBE_MATCH_REGISTRY`.
 */
export const ADOBE_MATCH_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(ADOBE_MATCH_REGISTRY).map(([k, v]) => [k, v.matchName])
);

/**
 * Look up a preset key and return the Adobe match-name. Falls back to
 * the Lumetri base for `color` category misses. Returns `null` for
 * non-color misses so the caller can decide whether to skip or surface
 * an error.
 *
 * Pass `onUnverified` to receive a warning callback for unverified
 * mappings — used by the composite tool layer to log a warning before
 * trying an apply that's likely to fail.
 */
export function resolveAdobeMatchName(
  key: string,
  category: 'transition' | 'color' | 'zoom' | 'text' | 'audio' | 'speed' | 'distort' | 'stylize',
  onUnverified?: (entry: AdobeMatchEntry) => void
): string | null {
  const entry = ADOBE_MATCH_REGISTRY[key];
  if (entry) {
    if (!entry.verified) onUnverified?.(entry);
    return entry.matchName;
  }
  if (category === 'color') return ADOBE_LUMETRI_MATCH_NAME;
  return null;
}

/** Return only the verified-against-real-Premiere subset. Useful to
 *  feed the Director system prompt so the LLM doesn't propose tools
 *  that we know will fail. */
export function listVerifiedMatchNames(): readonly { key: string; matchName: string }[] {
  return Object.entries(ADOBE_MATCH_REGISTRY)
    .filter(([, v]) => v.verified)
    .map(([k, v]) => ({ key: k, matchName: v.matchName }));
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

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
 * V3 — Confidence tiers replacing the binary `verified` flag.
 *
 *   'high'       — Component shipped by Adobe Premiere Pro 2026 stock;
 *                  match-name confirmed in UXP DEC samples + SDK docs.
 *   'medium'     — Real Adobe After Effects component that Premiere can
 *                  apply via Effects panel, BUT may need the effect to
 *                  be installed/enabled in the user's Premiere config.
 *                  Apply may fail with "component not found" on a fresh
 *                  install.
 *   'unverified' — Best-guess fallback, third-party plugin, or
 *                  known-removed component. Apply will likely fail.
 *                  Callers should skip in autogen plans unless they
 *                  ship the underlying preset asset.
 *
 * The old `verified: true | false` boolean was misleading — many of the
 * formerly "verified" entries are actually `medium` (could fail under
 * the right conditions). This tiering makes that honest.
 */
export type AdobeConfidence = 'high' | 'medium' | 'unverified';

interface AdobeMatchEntry {
  readonly matchName: string;
  readonly confidence: AdobeConfidence;
  readonly note?: string;
  /** @deprecated Kept for backward compat — true iff confidence === 'high'. */
  readonly verified: boolean;
}

/** Helper so we don't repeat ourselves on every entry. */
function entry(matchName: string, confidence: AdobeConfidence, note?: string): AdobeMatchEntry {
  return { matchName, confidence, verified: confidence === 'high', note };
}

export const ADOBE_MATCH_REGISTRY: Record<string, AdobeMatchEntry> = {
  // ─── Transitions: HIGH confidence (Premiere stock, always present) ──
  cross_dissolve: entry(`${TX}Cross Dissolve`, 'high'),
  dip_to_black: entry(`${TX}Dip to Black`, 'high'),
  dip_to_white: entry(`${TX}Dip to White`, 'high'),
  film_dissolve: entry(`${TX}Film Dissolve`, 'high'),

  // ─── Transitions: MEDIUM (real Adobe, may depend on Premiere build) ─
  cross_zoom: entry(
    `${TX}Cross Zoom`,
    'medium',
    'Cross Zoom is an AE transition that Premiere can use; effect must be enabled in Effects panel.'
  ),
  morph_cut: entry(
    `${TX}Morph Cut`,
    'medium',
    'Premiere built-in but requires analysis pass; may fail on short clips < 2s.'
  ),
  slide_left: entry(
    `${TX}Slide`,
    'medium',
    'Generic "Slide" matchName covers Slide Left/Right/Up/Down; direction set via param.'
  ),
  iris_round: entry(
    `${TX}Iris Round`,
    'medium',
    'Iris transition family; specific shape via params. Confirm exists on user system.'
  ),

  // ─── Transitions: UNVERIFIED (fabrications or removed components) ───
  whip_pan: entry(
    `${TX}Iris Round`,
    'unverified',
    'No native Whip Pan in Premiere; mapped to Iris Round as closest fallback. Skip unless you ship a custom preset.'
  ),
  page_turn: entry(
    `${TX}Page Turn`,
    'unverified',
    'Page Turn was removed from Premiere ≥ v23. Will fail silently — pick another transition.'
  ),

  // ─── Color: HIGH (Lumetri is rock-solid + always present) ───────────
  warm_vlog: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  teal_orange: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  punchy_vibrant: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  desaturated_film: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  noir_high_contrast: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  pastel_dream: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  sunset_glow: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  cold_drama: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  tech_blue: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  vintage_kodak: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  matrix_green: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),
  bw_documentary: entry(ADOBE_LUMETRI_MATCH_NAME, 'high'),

  // ─── Zoom / motion ──────────────────────────────────────────────────
  // Transform IS a real Premiere built-in — `high` for the component
  // itself. The "zoom_punch / pulse / highlight / ken_burns" labels are
  // keyframe-animation styling on top of Transform, so the COMPONENT
  // applies cleanly even if the LLM needs to set keyframes separately.
  zoom_punch: entry(`${TX}Transform`, 'high'),
  zoom_highlight: entry(`${TX}Transform`, 'high'),
  zoom_pulse: entry(`${TX}Transform`, 'high'),
  ken_burns: entry(`${TX}Transform`, 'high'),
  // Parallax / Tilt-Shift / Lens Distortion are AE effects that Premiere
  // can apply but depend on the user's installed effect pack — medium.
  parallax: entry(
    `${TX}Parallax`,
    'medium',
    'AE effect — confirm available in user Premiere install. Some builds ship it under Video Effects > Distort.'
  ),
  tilt_shift: entry(
    `${TX}Tilt-Shift Blur`,
    'medium',
    'Tilt-Shift Blur is AE-side; if absent, fall back to Gaussian Blur on a mask.'
  ),
  lens_distort: entry(
    `${TX}Lens Distortion`,
    'medium',
    'AE Lens Distortion effect. Usually present, but params differ from Adobe Lens Correction.'
  ),

  // ─── Zoom / motion: UNVERIFIED (third-party plugins) ────────────────
  shake: entry(
    `${TX}Camera Shake Deluxe`,
    'unverified',
    'Camera Shake Deluxe is Red Giant Universe (paid plugin), not Adobe stock. Will fail if not installed.'
  ),
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
 * the Lumetri base for `color` category misses.
 *
 * The `onLowConfidence` callback fires for `'medium'` and `'unverified'`
 * entries so callers can log a warning or skip the apply.
 */
export function resolveAdobeMatchName(
  key: string,
  category: 'transition' | 'color' | 'zoom' | 'text' | 'audio' | 'speed' | 'distort' | 'stylize',
  onLowConfidence?: (entry: AdobeMatchEntry) => void
): string | null {
  const e = ADOBE_MATCH_REGISTRY[key];
  if (e) {
    if (e.confidence !== 'high') onLowConfidence?.(e);
    return e.matchName;
  }
  if (category === 'color') return ADOBE_LUMETRI_MATCH_NAME;
  return null;
}

/**
 * V3 — List entries by minimum confidence tier. `'high'` is the safest
 * subset to feed into the Director prompt; `'medium'` is acceptable
 * with a fallback strategy; `'unverified'` should be excluded from
 * autogen plans.
 */
export function listMatchNamesByConfidence(
  minConfidence: AdobeConfidence = 'high'
): readonly { key: string; matchName: string; confidence: AdobeConfidence }[] {
  const tier: Record<AdobeConfidence, number> = {
    unverified: 0,
    medium: 1,
    high: 2,
  };
  const threshold = tier[minConfidence];
  return Object.entries(ADOBE_MATCH_REGISTRY)
    .filter(([, v]) => tier[v.confidence] >= threshold)
    .map(([k, v]) => ({ key: k, matchName: v.matchName, confidence: v.confidence }));
}

/** @deprecated Use listMatchNamesByConfidence('high') instead. */
export function listVerifiedMatchNames(): readonly { key: string; matchName: string }[] {
  return listMatchNamesByConfidence('high').map(({ key, matchName }) => ({ key, matchName }));
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

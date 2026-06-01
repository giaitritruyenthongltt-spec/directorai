/**
 * F1 — Lumetri preset params lookup.
 *
 * Premiere's UXP API doesn't expose a "load preset by name" verb directly
 * (that path is `Lumetri.applyLook(<file>.cube)` for LUTs and requires a
 * file on disk). Instead, we ship a curated parameter recipe per preset
 * key — each is a tuned combination of the 6 Lumetri Basic Correction
 * sliders that approximates the named look on stock footage.
 *
 * Values are normalised to the same scales `setColorParams` expects:
 *   exposure   −5..5  (EV)
 *   contrast  −100..100
 *   highlights −100..100
 *   shadows   −100..100
 *   saturation 0..200  (100 = identity)
 *   temperature −100..100  (positive = warmer)
 *
 * These approximations are a stop-gap until we ship `.prfpset` files +
 * a load-by-file primitive. Real `.look`/`.cube` LUT files give higher
 * fidelity but require shipping binary assets.
 */

export interface LumetriRecipe {
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  saturation?: number;
  temperature?: number;
}

export const LUMETRI_RECIPES: Record<string, LumetriRecipe> = {
  // Warm + lifted shadows, gentle contrast — classic vlog look.
  warm_vlog: {
    exposure: 0.2,
    contrast: 8,
    highlights: -10,
    shadows: 12,
    saturation: 108,
    temperature: 18,
  },
  // Pushed teal shadows + orange skin — cinema split toning.
  teal_orange: {
    exposure: 0,
    contrast: 18,
    highlights: -15,
    shadows: -8,
    saturation: 115,
    temperature: 10,
  },
  // High-energy social: saturation + contrast cranked.
  punchy_vibrant: {
    exposure: 0.3,
    contrast: 25,
    highlights: -5,
    shadows: 5,
    saturation: 130,
    temperature: 5,
  },
  // Muted greens + greys, indie film vibe.
  desaturated_film: {
    exposure: -0.1,
    contrast: 12,
    highlights: -10,
    shadows: 8,
    saturation: 75,
    temperature: -5,
  },
  // Crushed blacks, low saturation, B&W-leaning.
  noir_high_contrast: {
    exposure: -0.2,
    contrast: 40,
    highlights: 10,
    shadows: -25,
    saturation: 40,
    temperature: -8,
  },
  // Lifted shadows, low contrast, soft warm hues.
  pastel_dream: {
    exposure: 0.4,
    contrast: -10,
    highlights: 5,
    shadows: 18,
    saturation: 95,
    temperature: 12,
  },
  // Magenta highlights, warm midtones.
  sunset_glow: {
    exposure: 0.1,
    contrast: 14,
    highlights: -5,
    shadows: 8,
    saturation: 118,
    temperature: 22,
  },
  // Cool shadows + crushed midtones — dramatic.
  cold_drama: {
    exposure: -0.15,
    contrast: 22,
    highlights: -12,
    shadows: -10,
    saturation: 105,
    temperature: -25,
  },
  // Tech / screencap blue cast.
  tech_blue: {
    exposure: 0.1,
    contrast: 12,
    highlights: -8,
    shadows: -5,
    saturation: 95,
    temperature: -18,
  },
  // Film stock emulation — slight green/yellow shadows, lifted blacks.
  vintage_kodak: {
    exposure: 0.05,
    contrast: 6,
    highlights: -12,
    shadows: 15,
    saturation: 88,
    temperature: 14,
  },
  // Heavy green cast — Matrix homage.
  matrix_green: {
    exposure: -0.2,
    contrast: 18,
    highlights: -15,
    shadows: -8,
    saturation: 90,
    temperature: -20,
  },
  // Pure neutral B&W (saturation 0).
  bw_documentary: {
    exposure: 0,
    contrast: 15,
    highlights: 0,
    shadows: 0,
    saturation: 0,
    temperature: 0,
  },
};

/** Returns null when the preset key isn't in the catalog. */
export function getLumetriRecipe(presetKey: string): LumetriRecipe | null {
  return LUMETRI_RECIPES[presetKey] ?? null;
}

/** Every preset key in the catalog — useful for validation tests. */
export const LUMETRI_PRESET_KEYS: readonly string[] = Object.keys(LUMETRI_RECIPES);

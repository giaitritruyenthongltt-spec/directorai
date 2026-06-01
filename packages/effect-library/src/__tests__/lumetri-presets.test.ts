/**
 * V4 — Lumetri recipe coverage + range-validation tests.
 */

import { describe, expect, it } from 'vitest';
import {
  getLumetriRecipe,
  LUMETRI_PARAM_RANGES,
  LUMETRI_PRESET_KEYS,
  LUMETRI_RECIPES,
  type LumetriRecipe,
} from '../lumetri-presets.js';

const PRESET_KEYS = [
  'warm_vlog',
  'teal_orange',
  'punchy_vibrant',
  'desaturated_film',
  'noir_high_contrast',
  'pastel_dream',
  'sunset_glow',
  'cold_drama',
  'tech_blue',
  'vintage_kodak',
  'matrix_green',
  'bw_documentary',
] as const;

describe('LUMETRI_RECIPES catalog', () => {
  it('has 12 presets', () => {
    expect(LUMETRI_PRESET_KEYS.length).toBe(12);
    expect(new Set(LUMETRI_PRESET_KEYS).size).toBe(12); // no dupes
  });

  it.each(PRESET_KEYS)('preset %s sets all 9 Basic Correction sliders', (key) => {
    const r = getLumetriRecipe(key);
    expect(r).toBeDefined();
    const required: (keyof LumetriRecipe)[] = [
      'exposure',
      'contrast',
      'highlights',
      'shadows',
      'whites',
      'blacks',
      'saturation',
      'vibrance',
      'temperature',
    ];
    for (const k of required) {
      expect(r?.[k], `${key}.${k} should be defined (V4)`).toBeTypeOf('number');
    }
  });

  it.each(PRESET_KEYS)('preset %s stays within Lumetri param ranges', (key) => {
    const r = getLumetriRecipe(key)!;
    for (const [param, range] of Object.entries(LUMETRI_PARAM_RANGES)) {
      const v = r[param as keyof LumetriRecipe];
      if (v === undefined) continue;
      expect(v, `${key}.${param}=${v} below min ${range.min}`).toBeGreaterThanOrEqual(range.min);
      expect(v, `${key}.${param}=${v} above max ${range.max}`).toBeLessThanOrEqual(range.max);
    }
  });

  it('bw_documentary fully desaturates', () => {
    const r = getLumetriRecipe('bw_documentary')!;
    expect(r.saturation).toBe(0);
    expect(r.vibrance).toBe(0);
  });

  it('noir_high_contrast crushes blacks aggressively', () => {
    const r = getLumetriRecipe('noir_high_contrast')!;
    expect(r.blacks).toBeLessThanOrEqual(-25);
    expect(r.contrast).toBeGreaterThanOrEqual(30);
  });

  it('warm_vlog leans warm (positive temperature)', () => {
    const r = getLumetriRecipe('warm_vlog')!;
    expect(r.temperature).toBeGreaterThan(0);
  });

  it('cold_drama / tech_blue / matrix_green lean cool (negative temperature)', () => {
    expect(getLumetriRecipe('cold_drama')?.temperature).toBeLessThan(0);
    expect(getLumetriRecipe('tech_blue')?.temperature).toBeLessThan(0);
    expect(getLumetriRecipe('matrix_green')?.temperature).toBeLessThan(0);
  });

  it('getLumetriRecipe returns null for unknown key', () => {
    expect(getLumetriRecipe('does_not_exist')).toBeNull();
  });

  it('LUMETRI_RECIPES has every PRESET_KEYS entry', () => {
    for (const k of PRESET_KEYS) {
      expect(LUMETRI_RECIPES[k]).toBeDefined();
    }
  });
});

describe('LUMETRI_PARAM_RANGES validation table', () => {
  it('declares min<max for every param', () => {
    for (const [name, r] of Object.entries(LUMETRI_PARAM_RANGES)) {
      expect(r.min, `${name}.min < max`).toBeLessThan(r.max);
    }
  });

  it('saturation uses 0..200 (positive scale), others bipolar -100..100', () => {
    expect(LUMETRI_PARAM_RANGES.saturation.min).toBe(0);
    expect(LUMETRI_PARAM_RANGES.saturation.max).toBe(200);
    expect(LUMETRI_PARAM_RANGES.contrast.min).toBe(-100);
    expect(LUMETRI_PARAM_RANGES.contrast.max).toBe(100);
  });

  it('exposure uses EV-scale (-5..5)', () => {
    expect(LUMETRI_PARAM_RANGES.exposure.min).toBe(-5);
    expect(LUMETRI_PARAM_RANGES.exposure.max).toBe(5);
  });
});

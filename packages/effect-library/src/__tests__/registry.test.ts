import { describe, it, expect } from 'vitest';
import {
  EFFECT_PRESETS,
  findPreset,
  listAllCategories,
  listPresetsByCategory,
} from '../registry.js';

describe('effect-library', () => {
  it('has at least 15 presets', () => {
    expect(EFFECT_PRESETS.length).toBeGreaterThanOrEqual(15);
  });

  it('finds presets by key', () => {
    const p = findPreset('zoom_punch');
    expect(p).toBeDefined();
    expect(p!.displayName).toBe('Zoom Punch');
  });

  it('returns undefined for unknown key', () => {
    expect(findPreset('does_not_exist')).toBeUndefined();
  });

  it('lists distinct categories', () => {
    const cats = listAllCategories();
    expect(cats).toContain('transition');
    expect(cats).toContain('color');
    expect(cats).toContain('zoom');
  });

  it('filters by category', () => {
    const transitions = listPresetsByCategory('transition');
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions.every((p) => p.category === 'transition')).toBe(true);
  });

  it('every preset has unique key', () => {
    const keys = EFFECT_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

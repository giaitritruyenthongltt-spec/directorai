import { describe, expect, it } from 'vitest';

import {
  ADOBE_LUMETRI_MATCH_NAME,
  ADOBE_MATCH_NAMES,
  pickColorPresetForMood,
  resolveAdobeMatchName,
} from '../adobe-match-names.js';
import { EFFECT_PRESETS } from '../registry.js';

describe('adobe match-names catalog', () => {
  it('maps every transition preset to a non-null Adobe match-name', () => {
    const transitions = EFFECT_PRESETS.filter((p) => p.category === 'transition');
    expect(transitions.length).toBeGreaterThan(0);
    for (const t of transitions) {
      expect(ADOBE_MATCH_NAMES[t.key], `missing mapping for ${t.key}`).toBeDefined();
    }
  });

  it('maps every color preset to the Lumetri base', () => {
    const colors = EFFECT_PRESETS.filter((p) => p.category === 'color');
    for (const c of colors) {
      expect(ADOBE_MATCH_NAMES[c.key]).toBe(ADOBE_LUMETRI_MATCH_NAME);
    }
  });

  it('resolveAdobeMatchName returns mapped value when present', () => {
    const got = resolveAdobeMatchName('cross_dissolve', 'transition');
    expect(got).toBe('AE.ADBE Cross Dissolve');
  });

  it('resolveAdobeMatchName falls back to Lumetri for unknown color keys', () => {
    const got = resolveAdobeMatchName('made_up_preset', 'color');
    expect(got).toBe(ADOBE_LUMETRI_MATCH_NAME);
  });

  it('resolveAdobeMatchName returns null for unknown non-color keys', () => {
    const got = resolveAdobeMatchName('made_up_zoom', 'zoom');
    expect(got).toBeNull();
  });
});

describe('pickColorPresetForMood', () => {
  it.each([
    ['warm', 'warm_vlog'],
    ['cool', 'cold_drama'],
    ['dark', 'noir_high_contrast'],
    ['bright', 'punchy_vibrant'],
    ['neutral', 'teal_orange'],
  ] as const)('mood %s → preset %s', (mood, expected) => {
    expect(pickColorPresetForMood(mood)).toBe(expected);
  });
});

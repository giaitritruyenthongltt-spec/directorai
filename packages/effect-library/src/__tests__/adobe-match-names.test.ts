import { describe, expect, it } from 'vitest';

import {
  ADOBE_LUMETRI_MATCH_NAME,
  ADOBE_MATCH_NAMES,
  ADOBE_MATCH_REGISTRY,
  listVerifiedMatchNames,
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

describe('verified vs unverified mappings (F3)', () => {
  it('flags 3 known-bad mappings as unverified', () => {
    // These were fabrications caught in the F3 audit.
    expect(ADOBE_MATCH_REGISTRY.whip_pan?.verified).toBe(false);
    expect(ADOBE_MATCH_REGISTRY.page_turn?.verified).toBe(false);
    expect(ADOBE_MATCH_REGISTRY.shake?.verified).toBe(false);
  });

  it('listVerifiedMatchNames returns only verified rows', () => {
    const verified = listVerifiedMatchNames();
    expect(verified.length).toBeGreaterThan(0);
    for (const v of verified) {
      expect(ADOBE_MATCH_REGISTRY[v.key]?.verified).toBe(true);
    }
    expect(verified.find((v) => v.key === 'whip_pan')).toBeUndefined();
    expect(verified.find((v) => v.key === 'page_turn')).toBeUndefined();
  });

  it('resolveAdobeMatchName invokes onUnverified for fabricated keys', () => {
    let warned = '';
    const got = resolveAdobeMatchName('whip_pan', 'transition', (e) => {
      warned = e.note ?? 'unverified';
    });
    expect(got).toBe('AE.ADBE Iris Round');
    expect(warned).toMatch(/Whip Pan/);
  });

  it('resolveAdobeMatchName does NOT invoke onUnverified for verified keys', () => {
    let warned = false;
    resolveAdobeMatchName('cross_dissolve', 'transition', () => {
      warned = true;
    });
    expect(warned).toBe(false);
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

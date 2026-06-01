import { describe, expect, it } from 'vitest';

import {
  ADOBE_LUMETRI_MATCH_NAME,
  ADOBE_MATCH_NAMES,
  ADOBE_MATCH_REGISTRY,
  listMatchNamesByConfidence,
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

describe('confidence tiers (V3)', () => {
  it('flags 3 known-bad mappings as unverified', () => {
    expect(ADOBE_MATCH_REGISTRY.whip_pan?.confidence).toBe('unverified');
    expect(ADOBE_MATCH_REGISTRY.page_turn?.confidence).toBe('unverified');
    expect(ADOBE_MATCH_REGISTRY.shake?.confidence).toBe('unverified');
  });

  it('Lumetri-base color entries are all high-confidence', () => {
    for (const key of [
      'warm_vlog',
      'teal_orange',
      'punchy_vibrant',
      'noir_high_contrast',
      'bw_documentary',
    ]) {
      expect(ADOBE_MATCH_REGISTRY[key]?.confidence).toBe('high');
    }
  });

  it('AE-effect-pack zoom mappings sit at medium confidence', () => {
    for (const key of ['parallax', 'tilt_shift', 'lens_distort']) {
      expect(ADOBE_MATCH_REGISTRY[key]?.confidence).toBe('medium');
    }
  });

  it('deprecated `verified` boolean still mirrors confidence===high', () => {
    for (const [, v] of Object.entries(ADOBE_MATCH_REGISTRY)) {
      expect(v.verified).toBe(v.confidence === 'high');
    }
  });

  it('listMatchNamesByConfidence("high") excludes medium + unverified', () => {
    const high = listMatchNamesByConfidence('high');
    expect(high.find((v) => v.key === 'whip_pan')).toBeUndefined();
    expect(high.find((v) => v.key === 'parallax')).toBeUndefined(); // medium
    expect(high.find((v) => v.key === 'cross_dissolve')).toBeDefined();
    for (const v of high) expect(v.confidence).toBe('high');
  });

  it('listMatchNamesByConfidence("medium") includes high + medium', () => {
    const med = listMatchNamesByConfidence('medium');
    expect(med.find((v) => v.key === 'cross_dissolve')).toBeDefined(); // high
    expect(med.find((v) => v.key === 'parallax')).toBeDefined(); // medium
    expect(med.find((v) => v.key === 'whip_pan')).toBeUndefined(); // unverified
  });

  it('resolveAdobeMatchName invokes onLowConfidence for medium + unverified', () => {
    const warnings: string[] = [];
    resolveAdobeMatchName('parallax', 'zoom', (e) => warnings.push(`med:${e.confidence}`));
    resolveAdobeMatchName('whip_pan', 'transition', (e) => warnings.push(`unv:${e.confidence}`));
    expect(warnings).toEqual(['med:medium', 'unv:unverified']);
  });

  it('resolveAdobeMatchName does NOT fire callback for high-confidence', () => {
    let fired = false;
    resolveAdobeMatchName('cross_dissolve', 'transition', () => {
      fired = true;
    });
    expect(fired).toBe(false);
  });

  it('listVerifiedMatchNames is back-compat alias for confidence=high', () => {
    expect(listVerifiedMatchNames().length).toBe(listMatchNamesByConfidence('high').length);
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

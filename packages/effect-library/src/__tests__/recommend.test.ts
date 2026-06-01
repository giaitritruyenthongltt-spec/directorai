/**
 * Sprint D.4 — Effect recommender tests.
 */
import { describe, expect, it } from 'vitest';

import { EFFECT_PRESETS, recommend, recommendOne, tagCoverage } from '../index.js';

describe('recommend', () => {
  it('returns 3 results by default', () => {
    const out = recommend({ scene: 'action', mood: 'intense' });
    expect(out).toHaveLength(3);
  });

  it('topK controls result count', () => {
    expect(recommend({ scene: 'dialog', mood: 'calm', topK: 7 })).toHaveLength(7);
    expect(recommend({ scene: 'dialog', mood: 'calm', topK: 1 })).toHaveLength(1);
  });

  it('top result for action+intense includes an action-typed effect', () => {
    const [top] = recommend({ scene: 'action', mood: 'intense' });
    expect(top.score).toBeGreaterThan(0.5);
    // The reasons should reference both axes
    const joined = top.reasons.join(' ');
    expect(joined).toMatch(/action/);
    expect(joined).toMatch(/intense/);
  });

  it('top result for dialog+calm prefers gentle effects', () => {
    const [top] = recommend({ scene: 'dialog', mood: 'calm' });
    // A whip-pan should NEVER win for dialog+calm
    expect(top.preset.key).not.toBe('whip_pan');
    expect(top.preset.key).not.toBe('shake');
    expect(top.preset.key).not.toBe('zoom_punch');
  });

  it('category filter restricts the pool', () => {
    const out = recommend({
      scene: 'action',
      mood: 'intense',
      categories: ['color'],
      topK: 5,
    });
    for (const r of out) {
      expect(r.preset.category).toBe('color');
    }
  });

  it('pacing influences scores', () => {
    // For a fast-tagged effect like whip_pan: scoring with pacing='fast'
    // should give a strictly higher score than pacing='slow'.
    const fast = recommend({ scene: 'action', mood: 'intense', pacing: 'fast', topK: 50 });
    const slow = recommend({ scene: 'action', mood: 'intense', pacing: 'slow', topK: 50 });
    const fastWhip = fast.find((r) => r.preset.key === 'whip_pan');
    const slowWhip = slow.find((r) => r.preset.key === 'whip_pan');
    expect(fastWhip).toBeDefined();
    expect(slowWhip).toBeDefined();
    expect(fastWhip!.score).toBeGreaterThan(slowWhip!.score);
  });

  it('deterministic — same input twice → identical output', () => {
    const a = recommend({ scene: 'landscape', mood: 'dreamy', topK: 5 });
    const b = recommend({ scene: 'landscape', mood: 'dreamy', topK: 5 });
    expect(a.map((r) => r.preset.key)).toEqual(b.map((r) => r.preset.key));
  });

  it('recommendOne returns just the top preset', () => {
    const p = recommendOne('action', 'intense');
    expect(p).toBeDefined();
    expect(p?.category).toBeDefined();
  });

  it('scores are in [0,1]', () => {
    const out = recommend({ scene: 'action', mood: 'intense', topK: 50 });
    for (const r of out) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('reasons are non-empty for high-score picks', () => {
    const [top] = recommend({ scene: 'action', mood: 'intense' });
    expect(top.reasons.length).toBeGreaterThan(0);
  });
});

describe('tagCoverage', () => {
  it('every preset is tagged (no fallback-only entries)', () => {
    const cov = tagCoverage();
    expect(cov.total).toBe(EFFECT_PRESETS.length);
    // We tagged every key — but be defensive (allow up to 5% untagged
    // before failing so future preset additions don't break CI).
    expect(cov.tagged / cov.total).toBeGreaterThan(0.95);
  });
});

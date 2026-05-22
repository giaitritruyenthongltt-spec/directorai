import { describe, it, expect } from 'vitest';
import { getBuiltinStyle } from '@directorai/style-engine';
import { seconds, type Seconds } from '@directorai/core';
import { planCuts } from '../planner.js';
import type { MediaContext } from '../types.js';

function makeContext(): MediaContext {
  return {
    mediaPath: 'C:\\test.mp4',
    durationSec: seconds(60),
    segments: [
      { start: seconds(0), end: seconds(2), text: 'Hello everyone' },
      { start: seconds(2), end: seconds(2.5) as Seconds, text: 'um', isFiller: true },
      {
        start: seconds(2.5) as Seconds,
        end: seconds(5) as Seconds,
        text: 'Today I show an AI tool',
        isFiller: false,
      },
      { start: seconds(5) as Seconds, end: seconds(6) as Seconds, text: '...', isSilence: true },
      {
        start: seconds(6) as Seconds,
        end: seconds(10),
        text: 'the plugin works great',
        isFiller: false,
      },
    ],
    scenes: [{ start: seconds(0), end: seconds(10) }],
    beats: [seconds(1), seconds(3), seconds(5), seconds(7), seconds(9)],
  };
}

describe('planCuts', () => {
  it('removes silence when style says so', () => {
    const ctx = makeContext();
    const plan = planCuts({ style: getBuiltinStyle('vlog'), context: ctx });
    const silenceRemovals = plan.steps.filter((s) => s.reason.includes('silence'));
    expect(silenceRemovals.length).toBe(1);
  });

  it('does NOT remove silence for cinematic style', () => {
    const ctx = makeContext();
    const plan = planCuts({ style: getBuiltinStyle('cinematic'), context: ctx });
    const silenceRemovals = plan.steps.filter((s) => s.reason.includes('silence'));
    expect(silenceRemovals.length).toBe(0);
  });

  it('triggers effects on keywords for tech-reel style', () => {
    const ctx = makeContext();
    const plan = planCuts({ style: getBuiltinStyle('techReel'), context: ctx });
    const effects = plan.steps.filter((s) => s.tool === 'effect_apply');
    expect(effects.length).toBeGreaterThanOrEqual(2);
  });

  it('emits beat markers when style has beat trigger', () => {
    const ctx = makeContext();
    const plan = planCuts({ style: getBuiltinStyle('techReel'), context: ctx });
    const beatMarkers = plan.steps.filter((s) => s.tool === 'marker_add');
    expect(beatMarkers.length).toBe(5);
  });

  it('applies color preset when style has one', () => {
    const ctx = makeContext();
    const plan = planCuts({ style: getBuiltinStyle('cinematic'), context: ctx });
    const colorSteps = plan.steps.filter((s) => s.tool === 'color_applyPreset');
    expect(colorSteps.length).toBe(1);
  });

  it('produces summary and estimated duration', () => {
    const ctx = makeContext();
    const plan = planCuts({ style: getBuiltinStyle('vlog'), context: ctx });
    expect(plan.summary).toMatch(/Plan: \d+ steps/);
    expect(plan.estimatedDurationSec).toBeGreaterThan(0);
  });
});

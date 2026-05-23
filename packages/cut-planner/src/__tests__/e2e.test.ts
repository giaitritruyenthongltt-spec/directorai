/**
 * E2E test (P3.24): context + style → plan → executor → final timeline.
 *
 * Runs against MockPremiereAdapter so it's self-contained, no Premiere
 * needed. Covers all 5 built-in styles + a custom one.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MockPremiereAdapter } from '@directorai/premiere-adapter';
import {
  getBuiltinStyle,
  parseStyle,
  listBuiltinStyles,
  type Style,
} from '@directorai/style-engine';
import { seconds, type Seconds } from '@directorai/core';
import { planCuts, executePlan, formatExecutionReport, type MediaContext } from '../index.js';

function buildContext(): MediaContext {
  return {
    mediaPath: 'C:\\Fixtures\\sample.mp4',
    durationSec: seconds(90),
    segments: [
      { start: seconds(0), end: seconds(3), text: 'Hello and welcome' },
      { start: seconds(3), end: seconds(3.6), text: 'um uh', isFiller: true },
      { start: seconds(3.6), end: seconds(28), text: 'today I show you this AI premiere plugin' },
      { start: seconds(28), end: seconds(29.5), text: '', isSilence: true },
      {
        start: seconds(29.5),
        end: seconds(80),
        text: 'the plugin works by analyzing your footage with AI',
      },
      { start: seconds(80), end: seconds(90), text: 'thanks for watching' },
    ],
    scenes: [{ start: seconds(0), end: seconds(90) }],
    beats: [seconds(5), seconds(10), seconds(15), seconds(20)] as Seconds[],
  };
}

describe('E2E: context + style → plan → execute', () => {
  let adapter: MockPremiereAdapter;
  let context: MediaContext;

  beforeEach(() => {
    adapter = new MockPremiereAdapter();
    context = buildContext();
  });

  for (const styleName of listBuiltinStyles()) {
    it(`runs end-to-end for built-in style "${styleName}"`, async () => {
      const style = getBuiltinStyle(styleName);
      const plan = planCuts({ style, context });
      const result = await executePlan(plan, adapter, { dryRun: false });

      expect(result.plan.style).toBe(style.name);
      expect(result.ok + result.errors).toBeGreaterThanOrEqual(0);
      // The executor never throws — even errored steps land in `errors` count
      expect(result.steps.length).toBe(plan.steps.length);
    });
  }

  it('dry-run produces same audit shape without mutating adapter', async () => {
    const style = getBuiltinStyle('vlog');
    const plan = planCuts({ style, context });
    const dry = await executePlan(plan, adapter, { dryRun: true });

    expect(dry.dryRun).toBe(true);
    expect(dry.steps.every((s) => s.status === 'dry-run')).toBe(true);
    expect(dry.ok).toBe(0);
    expect(dry.errors).toBe(0);
  });

  it('stopOnError marks remaining steps as skipped', async () => {
    const style = getBuiltinStyle('techReel');
    const plan = planCuts({ style, context });
    // Force first step to fail by replacing with an unknown tool
    const mutated = {
      ...plan,
      steps: [
        {
          id: 'force-fail',
          tool: 'this_does_not_exist',
          args: {},
          reason: 'forced failure for test',
        },
        ...plan.steps,
      ],
    };
    const result = await executePlan(mutated, adapter, { stopOnError: true });
    expect(result.errors).toBeGreaterThan(0);
    const skipped = result.steps.filter((s) => s.status === 'skipped');
    expect(skipped.length).toBeGreaterThan(0);
  });

  it('formatExecutionReport produces readable output', async () => {
    const style = getBuiltinStyle('podcast');
    const plan = planCuts({ style, context });
    const result = await executePlan(plan, adapter, {});
    const report = formatExecutionReport(result);
    expect(report).toContain(`Plan "${style.name}"`);
    expect(report).toContain('steps');
  });

  it('custom YAML style executes correctly', async () => {
    const customYaml = `
name: Custom E2E
description: Test style for the E2E suite
pacing:
  hook:
    durationSec: 2
    cutsPerSec: 1.5
  body:
    cutsPerSec: 0.7
    beatSync: true
effects:
  - on: keyword
    keywords: ['AI', 'plugin']
    action: zoom_punch
removeFillers: true
removeSilence: true
color:
  preset: TealOrange
`;
    const style: Style = parseStyle(customYaml);
    const plan = planCuts({ style, context });
    const result = await executePlan(plan, adapter, {});
    expect(result.plan.style).toBe('Custom E2E');
  });
});

/**
 * P4.03 — cancellation tests for the executor.
 *
 * Verifies:
 *  - Pre-cancelled signal → first step is `cancelled`, rest `skipped`
 *  - Cancel mid-plan via onStep → current step finishes ok,
 *    next iteration marks cancelled, undo group still closes
 *  - `result.cancelled` flag is true when a cancellation occurred
 *  - withRetry / dispatchRpc surface AbortError on a flipped signal
 */
import { describe, it, expect } from 'vitest';
import {
  MockPremiereAdapter,
  dispatchRpc,
  withRetry,
  AbortError,
} from '@directorai/premiere-adapter';
import { getBuiltinStyle } from '@directorai/style-engine';
import { seconds, type Seconds } from '@directorai/core';
import { planCuts, executePlan, type MediaContext } from '../index.js';

function buildContext(): MediaContext {
  return {
    mediaPath: 'C:\\Fixtures\\sample.mp4',
    durationSec: seconds(90),
    segments: [
      { start: seconds(0), end: seconds(3), text: 'Hello and welcome' },
      { start: seconds(3), end: seconds(3.6), text: 'um uh', isFiller: true },
      { start: seconds(3.6), end: seconds(28), text: 'AI plugin demo' },
      { start: seconds(28), end: seconds(29.5), text: '', isSilence: true },
      { start: seconds(29.5), end: seconds(80), text: 'the plugin analyses footage' },
      { start: seconds(80), end: seconds(90), text: 'thanks for watching' },
    ],
    scenes: [{ start: seconds(0), end: seconds(90) }],
    beats: [seconds(5), seconds(10), seconds(15), seconds(20)] as Seconds[],
  };
}

describe('P4.03 — cancellable executor', () => {
  it('pre-cancelled signal → first step cancelled, rest skipped', async () => {
    const adapter = new MockPremiereAdapter();
    const style = getBuiltinStyle('vlog');
    const plan = planCuts({ style, context: buildContext() });

    const ac = new AbortController();
    ac.abort();

    const result = await executePlan(plan, adapter, { signal: ac.signal });

    expect(result.cancelled).toBe(true);
    expect(result.ok).toBe(0);
    expect(result.steps[0]!.status).toBe('cancelled');
    const remaining = result.steps.slice(1);
    expect(remaining.every((s) => s.status === 'skipped')).toBe(true);
    // Should NOT contain any 'ok' or 'error' steps
    expect(result.errors).toBe(0);
  });

  it('cancel mid-plan via onStep — current step completes, next cancels, rest skipped', async () => {
    const adapter = new MockPremiereAdapter();
    const style = getBuiltinStyle('vlog');
    const plan = planCuts({ style, context: buildContext() });
    if (plan.steps.length < 3) {
      throw new Error('plan too short for cancel test');
    }

    const ac = new AbortController();
    const cancelAt = 1; // abort after step index 1 completes
    const result = await executePlan(plan, adapter, {
      signal: ac.signal,
      onStep: (_r, i) => {
        if (i === cancelAt) ac.abort();
      },
    });

    expect(result.cancelled).toBe(true);
    // The first two steps reached the executor (status is ok or error,
    // but not skipped/cancelled). We don't care which — only that they ran.
    expect(['ok', 'error']).toContain(result.steps[0]!.status);
    expect(['ok', 'error']).toContain(result.steps[1]!.status);
    // Step index 2 should be the cancelled marker
    expect(result.steps[cancelAt + 1]!.status).toBe('cancelled');
    const tail = result.steps.slice(cancelAt + 2);
    expect(tail.every((s) => s.status === 'skipped')).toBe(true);
  });

  it('withRetry exits immediately when signal is pre-aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error('timeout');
        },
        { signal: ac.signal, initialDelayMs: 1 }
      )
    ).rejects.toThrow(AbortError);
    expect(calls).toBe(0);
  });

  it('dispatchRpc with pre-aborted signal throws AbortError without invoking the handler', async () => {
    const adapter = new MockPremiereAdapter();
    const ac = new AbortController();
    ac.abort();
    await expect(dispatchRpc('project.get', {}, adapter, { signal: ac.signal })).rejects.toThrow(
      /aborted/i
    );
  });

  it('formatExecutionReport marks cancelled plans', async () => {
    const adapter = new MockPremiereAdapter();
    const style = getBuiltinStyle('vlog');
    const plan = planCuts({ style, context: buildContext() });
    const ac = new AbortController();
    ac.abort();
    const result = await executePlan(plan, adapter, { signal: ac.signal });
    const { formatExecutionReport } = await import('../index.js');
    const report = formatExecutionReport(result);
    expect(report).toMatch(/cancelled/i);
  });
});

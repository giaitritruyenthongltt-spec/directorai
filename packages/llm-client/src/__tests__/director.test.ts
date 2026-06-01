/**
 * Sprint E — Director schema + executor tests.
 *
 * No real LLM call here — pure schema validation + plan executor logic.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  buildDirectorPrompt,
  DIRECTOR_SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,
  parsePlan,
  PERSONA_DESCRIPTIONS,
  PlanExecutor,
  type Plan,
  type PlanStep,
} from '../director/index.js';

// ─── Schema ────────────────────────────────────────────────────────────

const validPlan: Plan = {
  title: 'Test plan',
  goal: 'do something',
  persona: 'cinematic',
  estimatedMinutes: 10,
  steps: [
    { id: 1, tool: 'context.scanClips', params: {}, why: 'scan', checkpoint: false },
    { id: 2, tool: 'timeline.addMarkers', params: {}, why: 'mark', checkpoint: false },
  ],
};

describe('parsePlan', () => {
  it('accepts a valid plan', () => {
    const r = parsePlan(validPlan);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.steps).toHaveLength(2);
  });

  it('accepts every few-shot example', () => {
    for (const ex of FEW_SHOT_EXAMPLES) {
      const r = parsePlan(ex.plan);
      expect(r.ok).toBe(true);
    }
  });

  it('rejects missing required fields', () => {
    const r = parsePlan({ title: 'x' });
    expect(r.ok).toBe(false);
  });

  it('rejects unknown persona', () => {
    const r = parsePlan({ ...validPlan, persona: 'nope' });
    expect(r.ok).toBe(false);
  });

  it('rejects empty steps array', () => {
    const r = parsePlan({ ...validPlan, steps: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects step with empty tool name', () => {
    const r = parsePlan({
      ...validPlan,
      steps: [{ id: 1, tool: '', params: {}, why: 'x', checkpoint: false }],
    });
    expect(r.ok).toBe(false);
  });
});

// ─── Prompt ────────────────────────────────────────────────────────────

describe('buildDirectorPrompt', () => {
  it('includes the base system prompt + persona block + examples', () => {
    const p = buildDirectorPrompt('cinematic');
    expect(p).toContain(DIRECTOR_SYSTEM_PROMPT.slice(0, 50));
    expect(p).toContain(PERSONA_DESCRIPTIONS.cinematic);
    expect(p).toContain('EXAMPLE 1');
    expect(p).toContain('EXAMPLE 2');
  });

  it('different personas produce different prompts', () => {
    const a = buildDirectorPrompt('cinematic');
    const b = buildDirectorPrompt('action');
    expect(a).not.toEqual(b);
    expect(b).toContain(PERSONA_DESCRIPTIONS.action);
  });

  it('prompt is under 8K characters (rough token budget guard)', () => {
    const p = buildDirectorPrompt('cinematic');
    expect(p.length).toBeLessThan(8000);
  });
});

// ─── Executor ──────────────────────────────────────────────────────────

describe('PlanExecutor', () => {
  it('runs every step in order and resolves with done status', async () => {
    const called: string[] = [];
    const exec = new PlanExecutor(validPlan, async (step) => {
      called.push(step.tool);
      return { ok: true };
    });
    const final = await exec.run();
    expect(called).toEqual(['context.scanClips', 'timeline.addMarkers']);
    expect(final.status).toBe('done');
    expect(final.currentStep).toBe(2);
    expect(final.stepResults).toHaveLength(2);
    expect(final.stepResults.every((r) => r.ok)).toBe(true);
  });

  it('captures errors and stops execution', async () => {
    const exec = new PlanExecutor(validPlan, async (step) => {
      if (step.id === 1) throw new Error('boom');
      return null;
    });
    const final = await exec.run();
    expect(final.status).toBe('error');
    expect(final.stepResults[0].ok).toBe(false);
    expect(final.stepResults[0].error).toBe('boom');
    expect(final.stepResults).toHaveLength(1);
  });

  it('pauses at checkpoint until resume() is called', async () => {
    const checkpointPlan: Plan = {
      ...validPlan,
      steps: [
        { id: 1, tool: 'context.scanClips', params: {}, why: 'scan', checkpoint: true },
        { id: 2, tool: 'timeline.addMarkers', params: {}, why: 'mark', checkpoint: false },
      ],
    };
    const onCheckpoint = vi.fn();
    const exec = new PlanExecutor(checkpointPlan, async () => ({ ok: true }), { onCheckpoint });
    const runPromise = exec.run();
    // Give the executor a tick to reach the checkpoint
    await new Promise((r) => setTimeout(r, 5));
    expect(exec.snapshot().status).toBe('paused');
    expect(onCheckpoint).toHaveBeenCalledTimes(1);
    exec.resume();
    const final = await runPromise;
    expect(final.status).toBe('done');
    expect(final.stepResults).toHaveLength(2);
  });

  it('cancel() stops before the next step runs', async () => {
    const slow = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const exec = new PlanExecutor(validPlan, async () => {
      await slow(20);
      return null;
    });
    const runPromise = exec.run();
    await slow(5);
    exec.cancel();
    const final = await runPromise;
    expect(final.status).toBe('cancelled');
    // First step probably completed because cancel arrived mid-step; the
    // important assertion is that NOT all 2 steps ran.
    expect(final.stepResults.length).toBeLessThan(2);
  });

  it('emits onStart + onStepDone + onFinish in order', async () => {
    const events: string[] = [];
    const exec = new PlanExecutor(validPlan, async () => ({ ok: true }), {
      onStart: () => events.push('start'),
      onStepDone: (s) => events.push(`step-${s.id}`),
      onFinish: () => events.push('finish'),
    });
    await exec.run();
    expect(events).toEqual(['start', 'step-1', 'step-2', 'finish']);
  });

  it('snapshot is stable + has consistent counts', async () => {
    const exec = new PlanExecutor(validPlan, async () => ({ ok: true }));
    const final = await exec.run();
    expect(final.totalSteps).toBe(2);
    expect(final.currentStep).toBe(2);
    expect(final.stepResults).toHaveLength(2);
    expect(final.finishedAt).toBeDefined();
    expect(final.startedAt).toBeDefined();
  });
});

/**
 * F2 + F5 — Tests for PlanHistoryStore + DirectorRouter.listPlans / refine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLogger } from '@directorai/shared';
import type { director } from '@directorai/llm-client';

import { PlanHistoryStore, type PlanHistoryEntry } from '../director-history-store.js';

const logger = createLogger({ name: 'test', level: 'error' });

function makePlan(title = 'p'): director.Plan {
  return {
    title,
    goal: 'goal',
    persona: 'cinematic',
    estimatedMinutes: 5,
    steps: [
      {
        id: 1,
        tool: 'context.scanClips',
        params: {},
        why: 'scan',
        checkpoint: false,
      },
    ],
  };
}

function makeEntry(planId: string, plan: director.Plan): PlanHistoryEntry {
  return {
    planId,
    title: plan.title,
    persona: plan.persona,
    goal: plan.goal,
    stepCount: plan.steps.length,
    status: 'draft',
    createdAt: 1_000_000,
    plan,
  };
}

describe('PlanHistoryStore', () => {
  let dataDir: string;
  let store: PlanHistoryStore;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'directorai-test-'));
    store = new PlanHistoryStore(logger, dataDir);
    await store.loadOrInit();
  });

  it('starts empty when no file exists', () => {
    expect(store.totalCount()).toBe(0);
    expect(store.list(10)).toEqual([]);
  });

  it('add() prepends entries (latest first) and trims to 50', () => {
    for (let i = 0; i < 55; i++) {
      store.add(makeEntry(`p${i}`, makePlan(`t${i}`)));
    }
    expect(store.totalCount()).toBe(50);
    expect(store.list(5).map((e) => e.planId)).toEqual(['p54', 'p53', 'p52', 'p51', 'p50']);
  });

  it('update() patches an existing entry by planId', () => {
    store.add(makeEntry('a', makePlan()));
    store.update('a', { status: 'done', finishedAt: 2_000_000 });
    expect(store.find('a')?.status).toBe('done');
    expect(store.find('a')?.finishedAt).toBe(2_000_000);
  });

  it('update() is a no-op for unknown planId', () => {
    store.add(makeEntry('a', makePlan()));
    store.update('nope', { status: 'error' });
    expect(store.find('a')?.status).toBe('draft');
  });

  it('flush() writes to disk and a fresh instance reads it back', async () => {
    store.add(makeEntry('a', makePlan('first')));
    store.add(makeEntry('b', makePlan('second')));
    await store.flush();

    const fresh = new PlanHistoryStore(logger, dataDir);
    await fresh.loadOrInit();
    expect(fresh.totalCount()).toBe(2);
    expect(fresh.list(5).map((e) => e.planId)).toEqual(['b', 'a']);
    expect(fresh.find('a')?.title).toBe('first');
  });

  it('survives a corrupt JSON file by starting empty', async () => {
    // Write deliberately bad data
    store.add(makeEntry('a', makePlan()));
    await store.flush();
    const path = join(dataDir, 'plan-history.json');
    await readFile(path, 'utf-8'); // sanity: file exists
    // Stomp file with garbage
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, '{this is not json}', 'utf-8');
    const fresh = new PlanHistoryStore(logger, dataDir);
    await fresh.loadOrInit();
    expect(fresh.totalCount()).toBe(0);
  });
});

describe('DirectorRouter.listPlans + refine', () => {
  let dataDir: string;
  // Typed via the lazy-imported module below — keeps lint happy without
  // a static import that drags the router constructor up.
  let router: Awaited<ReturnType<typeof makeRouter>>;

  async function makeRouter(): Promise<{
    listPlans: (p: { limit?: number }) => unknown;
    execute: (p: { plan: director.Plan }) => Promise<{ planId: string }>;
    refine: (p: { previousPlanId: string; feedback: string }) => Promise<director.Plan>;
    plan: (p: { goal: string }) => Promise<director.Plan>;
    ready: () => Promise<void>;
  }> {
    const mod = await import('../director-router.js');
    return new mod.DirectorRouter({
      logger,
      toolDispatch: async () => null,
      llm: { provider: 'gemini', apiKey: 'fake-key-not-used', model: 'gemini-2.5-pro' },
    }) as unknown as Awaited<ReturnType<typeof makeRouter>>;
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'directorai-test-'));
    // Lazy-import so DIRECTORAI_DATA_DIR is picked up at construction time
    process.env.DIRECTORAI_DATA_DIR = dataDir;
    router = await makeRouter();
    await router.ready();
  });

  it('listPlans returns empty when nothing has been executed', () => {
    const out = router.listPlans({}) as { count: number; plans: unknown[] };
    expect(out.count).toBe(0);
    expect(out.plans).toEqual([]);
  });

  it('listPlans returns the history after an execute', async () => {
    const plan = makePlan('hello');
    const { planId } = await router.execute({ plan });
    // Give the async run a tick to register
    await new Promise((r) => setTimeout(r, 5));
    const out = router.listPlans({ limit: 5 }) as {
      count: number;
      plans: { planId: string; title: string; plan?: unknown }[];
    };
    expect(out.count).toBeGreaterThanOrEqual(1);
    expect(out.plans[0]?.planId).toBe(planId);
    expect(out.plans[0]?.title).toBe('hello');
    // The strip-plan invariant — no full plan body in list output.
    expect(out.plans[0]?.plan).toBeUndefined();
  });

  it('refine throws for unknown previousPlanId', async () => {
    await expect(
      router.refine({ previousPlanId: 'ghost', feedback: 'faster cuts' })
    ).rejects.toThrow(/Unknown previousPlanId/);
  });

  it('refine requires feedback', async () => {
    const plan = makePlan();
    const { planId } = await router.execute({ plan });
    await new Promise((r) => setTimeout(r, 5));
    await expect(router.refine({ previousPlanId: planId, feedback: '   ' })).rejects.toThrow(
      /feedback/
    );
  });

  it('refine builds a goal that mentions previous + feedback (we mock the LLM via plan() override)', async () => {
    const plan = makePlan('first run');
    const { planId } = await router.execute({ plan });
    await new Promise((r) => setTimeout(r, 5));

    // Stub `plan()` so we don't hit Gemini. Capture the goal it would
    // have sent and return a deterministic Plan.
    let observedGoal = '';
    router.plan = (async (params: { goal: string }) => {
      observedGoal = params.goal;
      return makePlan('refined run');
    }) as typeof router.plan;

    const refined = await router.refine({
      previousPlanId: planId,
      feedback: 'cắt nhanh hơn',
    });
    expect(refined.title).toBe('refined run');
    expect(observedGoal).toMatch(/Original goal/);
    expect(observedGoal).toMatch(/cắt nhanh hơn/);
    expect(observedGoal).toMatch(/first run/);
  });
});

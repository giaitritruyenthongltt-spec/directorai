/**
 * Sprint H.2 — Director router (server-side).
 *
 * Exposes 4 RPC methods consumed by apps/panel's DirectorTab:
 *   - director.plan      goal + persona  → Plan (JSON, validated)
 *   - director.execute   plan            → { planId }
 *   - director.progress  { planId }      → PlanProgress
 *   - director.cancel    { planId }      → { cancelled: boolean }
 *
 * LLM provider is picked from .env (GEMINI_API_KEY / ANTHROPIC_API_KEY /
 * OPENAI_API_KEY). Gemini gets priority when both are set since it has
 * the free tier.
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from '@directorai/shared';
import { director, type ToolDispatcher } from '@directorai/llm-client';
import { PlanHistoryStore, type PlanHistoryEntry } from './director-history-store.js';
import { opsLog } from './ops-log.js';

type Plan = director.Plan;
type PlanProgress = director.PlanProgress;

/** O1 — truncate a result value for ops-log preview (keeps log lean). */
function previewValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 500 ? `${s.slice(0, 500)}…(+${s.length - 500})` : v;
  }
  return v;
}

interface RouterDeps {
  readonly logger: Logger;
  readonly toolDispatch: ToolDispatcher;
  /** Override .env via constructor for tests. */
  readonly llm?: {
    provider: 'gemini' | 'anthropic' | 'openai';
    apiKey: string;
    model: string;
  };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 16384,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = (await res.json()) as GeminiResponse & {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string }[] };
    }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.error) throw new Error(`Gemini API: ${data.error.message}`);
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
  }
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`Gemini finishReason=${candidate.finishReason}`);
  }
  const text = candidate?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    throw new Error(
      `Gemini returned empty content (finishReason=${candidate?.finishReason ?? 'unknown'})`
    );
  }
  return text;
}

const MAX_HISTORY_LIMIT = 50;

export class DirectorRouter {
  private readonly executors = new Map<string, director.PlanExecutor>();
  // F2 — persistent plan history (was in-memory only in P3-1).
  private readonly historyStore: PlanHistoryStore;

  constructor(private readonly deps: RouterDeps) {
    this.historyStore = new PlanHistoryStore(deps.logger);
    // Load asynchronously — don't block constructor. Callers can opt
    // in via .ready() if they need to await persistence init.
    void this.historyStore.loadOrInit();
  }

  /** Await disk load — useful for tests + clean shutdown sequencing. */
  async ready(): Promise<void> {
    await this.historyStore.loadOrInit();
  }

  /** Force-persist now (call before process exit). */
  async shutdown(): Promise<void> {
    await this.historyStore.flush();
  }

  private trackPlan(planId: string, plan: director.Plan, goal: string): void {
    this.historyStore.add({
      planId,
      title: plan.title,
      persona: plan.persona,
      goal,
      stepCount: plan.steps.length,
      status: 'draft',
      createdAt: Date.now(),
      plan,
    });
  }

  private updateHistory(planId: string, patch: Partial<PlanHistoryEntry>): void {
    this.historyStore.update(planId, patch);
  }

  static fromEnv(deps: Omit<RouterDeps, 'llm'>): DirectorRouter | null {
    const provider = (process.env.LLM_PROVIDER ?? '').toLowerCase();
    if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
      return new DirectorRouter({
        ...deps,
        llm: {
          provider: 'gemini',
          apiKey: process.env.GEMINI_API_KEY,
          model: process.env.LLM_MODEL || 'gemini-2.5-pro',
        },
      });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return new DirectorRouter({
        ...deps,
        llm: {
          provider: 'anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: process.env.LLM_MODEL || 'claude-opus-4-7',
        },
      });
    }
    if (process.env.GEMINI_API_KEY) {
      return new DirectorRouter({
        ...deps,
        llm: {
          provider: 'gemini',
          apiKey: process.env.GEMINI_API_KEY,
          model: process.env.LLM_MODEL || 'gemini-2.5-pro',
        },
      });
    }
    deps.logger.warn('No LLM API key set — director router disabled');
    return null;
  }

  async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case 'director.plan':
        return this.plan(params as { goal: string; persona?: director.Persona });
      case 'director.execute':
        return this.execute(params as { plan: Plan });
      case 'director.progress':
        return this.progress(params as { planId: string });
      case 'director.cancel':
        return this.cancel(params as { planId: string });
      case 'director.listPlans':
        return this.listPlans(params as { limit?: number });
      case 'director.refine':
        return this.refine(
          params as { previousPlanId: string; feedback: string; persona?: director.Persona }
        );
      default:
        throw new Error(`Unknown director method: ${method}`);
    }
  }

  listMethods(): readonly string[] {
    return [
      'director.plan',
      'director.execute',
      'director.progress',
      'director.cancel',
      'director.listPlans',
      'director.refine',
    ];
  }

  // ─── plan ─────────────────────────────────────────────────────────────

  async plan(params: {
    goal: string;
    persona?: director.Persona;
  }): Promise<Plan & { planId: string }> {
    if (!this.deps.llm) throw new Error('No LLM configured');
    const persona: director.Persona = params.persona ?? 'cinematic';
    const goal = params.goal?.trim();
    if (!goal) throw new Error('goal is required');
    const systemPrompt = director.buildDirectorPrompt(persona);
    const t0 = Date.now();
    let raw: string;
    if (this.deps.llm.provider === 'gemini') {
      raw = await callGemini(this.deps.llm.apiKey, this.deps.llm.model, systemPrompt, goal);
    } else {
      throw new Error(`LLM provider ${this.deps.llm.provider} not yet wired for director`);
    }
    const elapsed = Date.now() - t0;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      this.deps.logger.error(
        { rawPreview: raw.slice(0, 200) },
        'director.plan: LLM returned non-JSON'
      );
      throw new Error('LLM response is not JSON', { cause: e });
    }
    const result = director.parsePlan(parsed);
    if (!result.ok) {
      this.deps.logger.error({ issues: result.error }, 'director.plan: plan schema invalid');
      throw new Error(`Plan schema invalid: ${result.error}`);
    }
    // B3 (DT5) — track plan ngay khi sinh (status 'draft') + trả planId, để
    // director.refine dùng được TRƯỚC khi execute (không phải ghi-timeline-rồi-mới-sửa).
    const draftId = `draft_${randomUUID().slice(0, 12)}`;
    this.trackPlan(draftId, result.plan, goal);
    this.deps.logger.info(
      {
        planId: draftId,
        elapsedMs: elapsed,
        steps: result.plan.steps.length,
        provider: this.deps.llm.provider,
        model: this.deps.llm.model,
      },
      'director.plan ok'
    );
    return { ...result.plan, planId: draftId };
  }

  // ─── execute ──────────────────────────────────────────────────────────

  async execute(params: { plan: Plan }): Promise<{ planId: string }> {
    if (!params.plan) throw new Error('plan is required');
    const parsed = director.parsePlan(params.plan);
    if (!parsed.ok) throw new Error(`Plan schema invalid: ${parsed.error}`);
    // O1 — capture planId for ops log via a mutable ref so callbacks
    // (closures) see it after exec is constructed.
    const planRef: { id: string } = { id: '' };
    const exec = new director.PlanExecutor(parsed.plan, this.deps.toolDispatch, {
      onStart: (plan) => {
        opsLog.record({
          event: 'plan.start',
          planId: planRef.id,
          title: plan.title,
          steps: plan.steps.length,
          persona: plan.persona,
        });
      },
      onStepDone: (step, r) => {
        this.deps.logger.info(
          { stepId: step.id, tool: step.tool, ok: r.ok, elapsedMs: r.elapsedMs },
          'plan step done'
        );
        opsLog.record({
          event: r.ok ? 'plan.step.end' : 'plan.step.error',
          planId: planRef.id,
          stepId: step.id,
          tool: step.tool,
          elapsedMs: r.elapsedMs,
          ...(r.ok ? { resultPreview: previewValue(r.result) } : { error: r.error }),
        });
      },
      onFinish: (snapshot) => {
        this.updateHistory(snapshot.planId, {
          status: snapshot.status,
          finishedAt: snapshot.finishedAt ?? Date.now(),
        });
        opsLog.record({
          event: 'plan.end',
          planId: snapshot.planId,
          status: snapshot.status,
          totalSteps: snapshot.totalSteps,
          stepsDone: snapshot.stepResults.length,
        });
      },
    });
    planRef.id = exec.snapshot().planId;
    const planId = exec.snapshot().planId;
    this.executors.set(planId, exec);
    // P3-1 — track in history so director.listPlans can surface it.
    this.trackPlan(planId, parsed.plan, parsed.plan.goal);
    this.updateHistory(planId, { status: 'running' });
    // Run async — don't block the RPC.
    void exec
      .run()
      .catch((e) =>
        this.deps.logger.error(
          { error: e instanceof Error ? e.message : String(e) },
          'plan crashed'
        )
      );
    return { planId };
  }

  // ─── listPlans ────────────────────────────────────────────────────────

  /** P3-1 — Return the history (most-recent first). */
  listPlans(params: { limit?: number }): {
    count: number;
    plans: Omit<PlanHistoryEntry, 'plan'>[];
  } {
    const limit = Math.min(params?.limit ?? 20, MAX_HISTORY_LIMIT);
    const slice = this.historyStore.list(limit);
    return {
      count: this.historyStore.totalCount(),
      // Strip the heavy `plan` payload — caller can fetch a full plan
      // by re-running director.progress(planId) if they want details.
      plans: slice.map((h) => ({
        planId: h.planId,
        title: h.title,
        persona: h.persona,
        goal: h.goal,
        stepCount: h.stepCount,
        status: h.status,
        createdAt: h.createdAt,
        finishedAt: h.finishedAt,
      })),
    };
  }

  // ─── refine ───────────────────────────────────────────────────────────

  /**
   * P3-3 — Generate a new plan that builds on a previous one + user
   * feedback ("faster cuts", "darker grade"). Re-runs director.plan but
   * with the previous plan's title/steps prepended to the system prompt
   * so Gemini knows the context.
   */
  async refine(params: {
    previousPlanId: string;
    feedback: string;
    persona?: director.Persona;
  }): Promise<Plan> {
    if (!this.deps.llm) throw new Error('No LLM configured');
    if (!params.feedback?.trim()) throw new Error('feedback is required');
    const prev = this.historyStore.find(params.previousPlanId);
    if (!prev) throw new Error(`Unknown previousPlanId: ${params.previousPlanId}`);
    const persona = params.persona ?? prev.persona;
    const refinedGoal = [
      `Original goal: ${prev.goal}`,
      `Previous plan title: ${prev.title}`,
      `Previous plan had ${prev.stepCount} steps and finished with status=${prev.status}.`,
      `USER FEEDBACK: ${params.feedback.trim()}`,
      '',
      'Refine the plan to incorporate the feedback. Keep what worked; replace what the user objected to.',
    ].join('\n');
    return this.plan({ goal: refinedGoal, persona });
  }

  // ─── progress ─────────────────────────────────────────────────────────

  progress(params: { planId: string }): PlanProgress {
    const exec = this.executors.get(params.planId);
    if (!exec) throw new Error(`Unknown planId: ${params.planId}`);
    return exec.snapshot();
  }

  // ─── cancel ───────────────────────────────────────────────────────────

  cancel(params: { planId: string }): { cancelled: boolean } {
    const exec = this.executors.get(params.planId);
    if (!exec) throw new Error(`Unknown planId: ${params.planId}`);
    exec.cancel();
    return { cancelled: true };
  }
}

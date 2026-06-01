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

import type { Logger } from '@directorai/shared';
import { director, type ToolDispatcher } from '@directorai/llm-client';

type Plan = director.Plan;
type PlanProgress = director.PlanProgress;

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

export class DirectorRouter {
  private readonly executors = new Map<string, director.PlanExecutor>();

  constructor(private readonly deps: RouterDeps) {}

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
      default:
        throw new Error(`Unknown director method: ${method}`);
    }
  }

  listMethods(): readonly string[] {
    return ['director.plan', 'director.execute', 'director.progress', 'director.cancel'];
  }

  // ─── plan ─────────────────────────────────────────────────────────────

  async plan(params: { goal: string; persona?: director.Persona }): Promise<Plan> {
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
    this.deps.logger.info(
      {
        elapsedMs: elapsed,
        steps: result.plan.steps.length,
        provider: this.deps.llm.provider,
        model: this.deps.llm.model,
      },
      'director.plan ok'
    );
    return result.plan;
  }

  // ─── execute ──────────────────────────────────────────────────────────

  async execute(params: { plan: Plan }): Promise<{ planId: string }> {
    if (!params.plan) throw new Error('plan is required');
    const parsed = director.parsePlan(params.plan);
    if (!parsed.ok) throw new Error(`Plan schema invalid: ${parsed.error}`);
    const exec = new director.PlanExecutor(parsed.plan, this.deps.toolDispatch, {
      onStepDone: (step, r) => {
        this.deps.logger.info(
          { stepId: step.id, tool: step.tool, ok: r.ok, elapsedMs: r.elapsedMs },
          'plan step done'
        );
      },
    });
    this.executors.set(exec.snapshot().planId, exec);
    // Run async — don't block the RPC.
    void exec
      .run()
      .catch((e) =>
        this.deps.logger.error(
          { error: e instanceof Error ? e.message : String(e) },
          'plan crashed'
        )
      );
    return { planId: exec.snapshot().planId };
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

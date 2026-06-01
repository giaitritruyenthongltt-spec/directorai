/**
 * Sprint E.3 — Plan executor.
 *
 * Runs PlanSteps sequentially via a caller-supplied tool dispatcher.
 * Emits progress events, supports checkpoint pause + cancel, and never
 * mutates the input Plan. The actual MCP/UXP calls happen inside the
 * dispatcher — this module is transport-agnostic so it's easy to unit
 * test.
 */

import type { Plan, PlanProgress, PlanStatus, PlanStep } from './schema.js';

export type ToolDispatcher = (step: PlanStep) => Promise<unknown>;

/**
 * Resolve a $placeholder string against the executor's context.
 *
 * Supported syntax (kept intentionally simple — the LLM doesn't need
 * Bash-level expressivity, just enough to wire previous-step results into
 * the next step):
 *
 *   "$context.activeSequence.id"      → context.activeSequence.id
 *   "$step.1.result.someField"         → results[0].result.someField
 *   "$prev.result.someField"           → last completed step's result.someField
 *
 * Anything else (including the "$forEach*" pseudo-tokens the LLM
 * sometimes invents) returns the placeholder string unchanged so the
 * underlying tool can decide how to handle it.
 */
function resolvePlaceholder(
  raw: string,
  context: Record<string, unknown>,
  results: PlanProgress['stepResults']
): unknown {
  if (!raw.startsWith('$')) return raw;
  const path = raw.slice(1).split('.');
  let current: unknown;
  const root = path[0];
  if (root === 'context') {
    current = context;
    for (const seg of path) {
      if (seg === 'context') continue;
      if (current && typeof current === 'object' && seg in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[seg];
      } else {
        return raw; // unresolved → keep original
      }
    }
    return current;
  }
  if (root === 'prev') {
    const lastOk = [...results].reverse().find((r) => r.ok);
    if (!lastOk) return raw;
    current = lastOk;
    for (const seg of path.slice(1)) {
      if (current && typeof current === 'object' && seg in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[seg];
      } else {
        return raw;
      }
    }
    return current;
  }
  if (root === 'step') {
    const stepId = Number(path[1]);
    const match = results.find((r) => r.stepId === stepId);
    if (!match) return raw;
    current = match;
    for (const seg of path.slice(2)) {
      if (current && typeof current === 'object' && seg in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[seg];
      } else {
        return raw;
      }
    }
    return current;
  }
  return raw;
}

/** Walk an object/array tree replacing any string starting with $ with
 *  the resolved value. Returns a NEW object — never mutates input. */
function resolveParams(
  params: unknown,
  context: Record<string, unknown>,
  results: PlanProgress['stepResults']
): unknown {
  if (typeof params === 'string') {
    return resolvePlaceholder(params, context, results);
  }
  if (Array.isArray(params)) {
    return params.map((p) => resolveParams(p, context, results));
  }
  if (params && typeof params === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      out[k] = resolveParams(v, context, results);
    }
    return out;
  }
  return params;
}

export interface ExecutorEvents {
  /** Called once at execution start. */
  onStart?: (plan: Plan) => void;
  /** Called after each step (success or failure). */
  onStepDone?: (
    step: PlanStep,
    result: { ok: boolean; result?: unknown; error?: string; elapsedMs: number }
  ) => void;
  /** Called when a checkpoint is reached. The promise gating user approval is
   *  resolved by the caller awaiting `waitForResume()`. */
  onCheckpoint?: (step: PlanStep, progress: PlanProgress) => void;
  /** Terminal event. */
  onFinish?: (progress: PlanProgress) => void;
}

export class PlanExecutor {
  private status: PlanStatus = 'draft';
  private currentIdx = 0;
  private results: PlanProgress['stepResults'] = [];
  private startedAt: number | undefined;
  private cancelled = false;
  private resumeResolver: (() => void) | null = null;
  /** Shared context built up as steps complete. Plans use
   *  "$context.activeSequence.id" etc. to reference these values. */
  private context: Record<string, unknown> = {};

  constructor(
    private readonly plan: Plan,
    private readonly dispatch: ToolDispatcher,
    private readonly events: ExecutorEvents = {},
    private readonly planId: string = Math.random().toString(36).slice(2, 10)
  ) {}

  /** Seed the resolver context (e.g. with activeSequence) before .run(). */
  withContext(extra: Record<string, unknown>): this {
    this.context = { ...this.context, ...extra };
    return this;
  }

  /** Start execution. Resolves when terminal (done / cancelled / error). */
  async run(): Promise<PlanProgress> {
    this.status = 'running';
    this.startedAt = Date.now();
    this.events.onStart?.(this.plan);

    for (let i = this.currentIdx; i < this.plan.steps.length; i++) {
      if (this.cancelled) {
        this.status = 'cancelled';
        break;
      }
      this.currentIdx = i;
      const step = this.plan.steps[i];
      if (!step) break; // unreachable under strict noUncheckedIndexedAccess
      const t0 = Date.now();
      // Resolve any $placeholder strings against current context + prior results.
      const resolvedParams = resolveParams(step.params, this.context, this.results);
      const resolvedStep: PlanStep = { ...step, params: resolvedParams as PlanStep['params'] };
      try {
        const result = await this.dispatch(resolvedStep);
        const elapsed = Date.now() - t0;
        this.results.push({ stepId: step.id, ok: true, result, elapsedMs: elapsed });
        // Auto-promote well-known tool results into the context so later
        // steps can refer to them with "$context.activeSequence.id" etc.
        if (step.tool === 'project.getActiveSequence' && result && typeof result === 'object') {
          this.context = { ...this.context, activeSequence: result };
        }
        if (step.tool === 'project.get' && result && typeof result === 'object') {
          this.context = { ...this.context, project: result };
        }
        this.events.onStepDone?.(step, { ok: true, result, elapsedMs: elapsed });
      } catch (e) {
        const elapsed = Date.now() - t0;
        const msg = e instanceof Error ? e.message : String(e);
        this.results.push({ stepId: step.id, ok: false, error: msg, elapsedMs: elapsed });
        this.events.onStepDone?.(step, { ok: false, error: msg, elapsedMs: elapsed });
        this.status = 'error';
        break;
      }
      if (step.checkpoint && i < this.plan.steps.length - 1 && !this.cancelled) {
        this.status = 'paused';
        this.events.onCheckpoint?.(step, this.snapshot());
        await this.waitForResume();
        if (this.cancelled) {
          this.status = 'cancelled';
          break;
        }
        this.status = 'running';
      }
    }

    if (this.status === 'running') this.status = 'done';
    const final = this.snapshot();
    this.events.onFinish?.(final);
    return final;
  }

  /** Resume from a checkpoint. No-op if not paused. */
  resume(): void {
    if (this.status !== 'paused') return;
    const r = this.resumeResolver;
    this.resumeResolver = null;
    r?.();
  }

  /** Cooperative cancel — current step finishes, then we stop. */
  cancel(): void {
    this.cancelled = true;
    // If we're paused at a checkpoint, the resume promise also unblocks.
    const r = this.resumeResolver;
    this.resumeResolver = null;
    r?.();
  }

  /** Get the current public snapshot. */
  snapshot(): PlanProgress {
    return {
      planId: this.planId,
      status: this.status,
      currentStep: this.currentIdx + (this.status === 'done' ? 1 : 0),
      totalSteps: this.plan.steps.length,
      stepResults: [...this.results],
      startedAt: this.startedAt,
      finishedAt:
        this.status === 'done' || this.status === 'cancelled' || this.status === 'error'
          ? Date.now()
          : undefined,
    };
  }

  private waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      this.resumeResolver = resolve;
    });
  }
}

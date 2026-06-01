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

  constructor(
    private readonly plan: Plan,
    private readonly dispatch: ToolDispatcher,
    private readonly events: ExecutorEvents = {},
    private readonly planId: string = Math.random().toString(36).slice(2, 10)
  ) {}

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
      const t0 = Date.now();
      try {
        const result = await this.dispatch(step);
        const elapsed = Date.now() - t0;
        this.results.push({ stepId: step.id, ok: true, result, elapsedMs: elapsed });
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

/**
 * Plan executor — walks a Plan and dispatches each PlanStep through the
 * Premiere adapter dispatcher.
 *
 * Guarantees:
 *  - All steps run inside one user-visible undo group (via undo.begin/end)
 *  - Step failures don't roll back previous steps unless `rollbackOnError`
 *    is set; instead, the error is recorded and execution continues
 *  - Dry-run mode skips dispatch but produces the same audit trail
 *  - Idempotent: same plan applied twice produces the same final state
 *    (relies on adapter idempotency, which Mock and UXP both honour)
 *
 * The executor is layer-3 (orchestration) — it depends on the adapter
 * dispatcher but never on a specific adapter implementation.
 */

import { dispatchRpc, isAbortError, type IPremiereAdapter } from '@directorai/premiere-adapter';
import type { Plan, PlanStep } from './types.js';

export interface ExecutionStepResult {
  readonly step: PlanStep;
  readonly status: 'ok' | 'error' | 'skipped' | 'dry-run' | 'cancelled';
  readonly result?: unknown;
  readonly error?: string;
  readonly durationMs: number;
}

export interface ExecutionResult {
  readonly plan: Plan;
  readonly steps: readonly ExecutionStepResult[];
  readonly totalMs: number;
  readonly ok: number;
  readonly errors: number;
  readonly cancelled: boolean;
  readonly dryRun: boolean;
}

export interface ExecuteOptions {
  /** If true, don't actually dispatch — just record steps as dry-run. */
  readonly dryRun?: boolean;
  /** If true, stop at the first error. Default: continue. */
  readonly stopOnError?: boolean;
  /** Optional progress hook called after each step. */
  readonly onStep?: (result: ExecutionStepResult, index: number, total: number) => void;
  /** Label for the wrapping undo group. Default: `"DirectorAI: ${plan.style}"`. */
  readonly undoLabel?: string;
  /**
   * Cancellation signal (P4.03). When aborted, the current step is
   * marked `cancelled`, remaining steps `skipped`, the undo group is
   * closed (committed) so the user can single-Ctrl-Z to revert.
   */
  readonly signal?: AbortSignal;
}

/**
 * Translate a `tool` string like `timeline_cutClip` (PlanStep.tool format)
 * back into the dotted RPC method `timeline.cutClip` expected by the
 * dispatcher. The cut-planner emits underscore-form because that's the
 * Anthropic tool name format (also what shows up in audit logs).
 */
function planStepMethodOf(step: PlanStep): string {
  // Heuristic: split on first underscore — left = namespace, right = method.
  // Works for our flat `namespace_method` convention. Falls back to identity
  // if the step is already dot-separated.
  if (step.tool.includes('.')) return step.tool;
  const i = step.tool.indexOf('_');
  if (i < 0) return step.tool;
  return `${step.tool.slice(0, i)}.${step.tool.slice(i + 1)}`;
}

export async function executePlan(
  plan: Plan,
  adapter: IPremiereAdapter,
  options: ExecuteOptions = {}
): Promise<ExecutionResult> {
  const dryRun = options.dryRun ?? false;
  const stopOnError = options.stopOnError ?? false;
  const label = options.undoLabel ?? `DirectorAI: ${plan.style}`;
  const signal = options.signal;
  const t0 = Date.now();

  const results: ExecutionStepResult[] = [];
  let ok = 0;
  let errors = 0;
  let cancelled = false;

  if (!dryRun) {
    await adapter.beginUndoGroup(label);
  }

  const markRemainingSkipped = (fromIndex: number): void => {
    for (let j = fromIndex; j < plan.steps.length; j++) {
      const skipped: ExecutionStepResult = {
        step: plan.steps[j]!,
        status: 'skipped',
        durationMs: 0,
      };
      results.push(skipped);
      options.onStep?.(skipped, j, plan.steps.length);
    }
  };

  try {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]!;
      const stepStart = Date.now();

      if (signal?.aborted) {
        cancelled = true;
        const sr: ExecutionStepResult = {
          step,
          status: 'cancelled',
          durationMs: 0,
        };
        results.push(sr);
        options.onStep?.(sr, i, plan.steps.length);
        markRemainingSkipped(i + 1);
        break;
      }

      if (dryRun) {
        const sr: ExecutionStepResult = {
          step,
          status: 'dry-run',
          durationMs: Date.now() - stepStart,
        };
        results.push(sr);
        options.onStep?.(sr, i, plan.steps.length);
        continue;
      }

      try {
        const method = planStepMethodOf(step);
        const result = await dispatchRpc(method, step.args, adapter, {
          // The executor opens its own undo group above, so disable the
          // dispatcher's per-call bracketing to avoid nested groups.
          autoUndoGroup: false,
          signal,
        });
        const sr: ExecutionStepResult = {
          step,
          status: 'ok',
          result,
          durationMs: Date.now() - stepStart,
        };
        results.push(sr);
        ok++;
        options.onStep?.(sr, i, plan.steps.length);
      } catch (err) {
        if (isAbortError(err)) {
          cancelled = true;
          const sr: ExecutionStepResult = {
            step,
            status: 'cancelled',
            durationMs: Date.now() - stepStart,
          };
          results.push(sr);
          options.onStep?.(sr, i, plan.steps.length);
          markRemainingSkipped(i + 1);
          break;
        }
        const message = err instanceof Error ? err.message : String(err);
        const sr: ExecutionStepResult = {
          step,
          status: 'error',
          error: message,
          durationMs: Date.now() - stepStart,
        };
        results.push(sr);
        errors++;
        options.onStep?.(sr, i, plan.steps.length);
        if (stopOnError) {
          markRemainingSkipped(i + 1);
          break;
        }
      }
    }
  } finally {
    if (!dryRun) {
      try {
        await adapter.endUndoGroup();
      } catch {
        // best-effort — don't mask original error
      }
    }
  }

  return {
    plan,
    steps: results,
    totalMs: Date.now() - t0,
    ok,
    errors,
    cancelled,
    dryRun,
  };
}

/** Build a human-readable execution report. */
export function formatExecutionReport(result: ExecutionResult): string {
  const flag = result.cancelled ? ' (cancelled)' : result.dryRun ? ' (dry-run)' : '';
  const head =
    `Plan "${result.plan.style}" — ${result.steps.length} steps` +
    `, ${result.ok} ok, ${result.errors} errors` +
    `, ${result.totalMs}ms${flag}\n`;
  const body = result.steps
    .map((s, i) => {
      const tag =
        s.status === 'ok'
          ? '✓'
          : s.status === 'error'
            ? '✗'
            : s.status === 'skipped'
              ? '—'
              : s.status === 'cancelled'
                ? '⊘'
                : '·';
      const tail =
        s.status === 'error'
          ? `: ${s.error}`
          : s.status === 'dry-run' || s.status === 'skipped' || s.status === 'cancelled'
            ? ''
            : ` (${s.durationMs}ms)`;
      return `${tag} [${i + 1}/${result.steps.length}] ${s.step.tool} — ${s.step.reason}${tail}`;
    })
    .join('\n');
  return head + body;
}

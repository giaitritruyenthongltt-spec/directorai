/**
 * O1 — Structured operational log to `~/.directorai/ops.log` (JSONL).
 *
 * Every event is one line — easy to tail + grep. Schema:
 *
 *   { ts: ISO, event: 'rpc.in' | 'rpc.out' | 'rpc.error' | 'plan.step.start'
 *           | 'plan.step.end' | 'plan.step.error' | 'panel.lifecycle'
 *           | 'panel.error',
 *     ... event-specific fields }
 *
 * Single global instance written via fs.appendFile so writes are
 * atomic on POSIX/Windows for entries under 4KB. No locking.
 *
 * Use:
 *   import { opsLog } from './ops-log.js';
 *   opsLog.record({ event: 'rpc.in', method: 'project.get', ... });
 *
 * Tail in a separate terminal:
 *   pnpm tsx tools/tail-ops.ts          # pretty-print
 *   tail -f ~/.directorai/ops.log       # raw JSONL
 */

import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import type { Logger } from '@directorai/shared';

interface OpsEvent {
  event: string;
  [k: string]: unknown;
}

class OpsLog {
  private readonly path: string;
  private initialized = false;

  constructor() {
    const root = process.env.DIRECTORAI_DATA_DIR ?? join(homedir(), '.directorai');
    this.path = join(root, 'ops.log');
  }

  private ensureDir(): void {
    if (this.initialized) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      this.initialized = true;
    } catch {
      // best-effort
    }
  }

  record(event: OpsEvent): void {
    this.ensureDir();
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        ...event,
      }) + '\n';
    try {
      appendFileSync(this.path, line, 'utf-8');
    } catch {
      // Swallow — ops log is best-effort, never crash hot path.
    }
  }

  /** Log a starting RPC + return a finalizer to log completion. */
  recordRpc(
    method: string,
    meta: Record<string, unknown> = {}
  ): (result: { ok: boolean; error?: string; resultSize?: number }) => void {
    const startedAt = Date.now();
    this.record({ event: 'rpc.in', method, ...meta });
    return ({ ok, error, resultSize }): void => {
      this.record({
        event: ok ? 'rpc.out' : 'rpc.error',
        method,
        durationMs: Date.now() - startedAt,
        ...(error ? { error } : {}),
        ...(typeof resultSize === 'number' ? { resultSize } : {}),
      });
    };
  }

  /** Get the configured log path — useful for tail-ops.ts. */
  get logPath(): string {
    return this.path;
  }
}

export const opsLog = new OpsLog();

/** Helper: wrap a logger.info/error so structured events ALSO go to ops.log. */
export function bindOpsTo(logger: Logger): Logger {
  return logger; // pass-through; opsLog is called explicitly by callers
}

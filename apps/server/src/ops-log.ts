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

import { mkdirSync, appendFileSync, statSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import type { Logger } from '@directorai/shared';

interface OpsEvent {
  event: string;
  [k: string]: unknown;
}

/** P3 — xoay vòng khi file vượt ngưỡng (giữ 1 file .1 cũ). */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * P1/P3 — Rút gọn 1 giá trị cho log: cắt chuỗi dài, lược object/array to,
 * BỎ các field khổng lồ (tracks/markers/clips) để dòng log GỌN, đọc được.
 */
export function lean(v: unknown, maxLen = 240): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string')
    return v.length > maxLen ? `${v.slice(0, maxLen)}…(+${v.length - maxLen})` : v;
  if (typeof v !== 'object') return v;
  const DROP = new Set(['tracks', 'markers', 'clips', 'segments', 'thumbnail', 'frames']);
  try {
    const compact = JSON.stringify(v, (k, val) => {
      if (DROP.has(k) && Array.isArray(val)) return `[${val.length} mục — lược]`;
      if (typeof val === 'string' && val.length > maxLen) return `${val.slice(0, maxLen)}…`;
      return val;
    });
    return compact.length > maxLen * 4 ? `${compact.slice(0, maxLen * 4)}…` : JSON.parse(compact);
  } catch {
    return String(v).slice(0, maxLen);
  }
}

export class OpsLog {
  private resolvedPath: string | null = null;
  private initialized = false;
  private bytes = -1; // -1 = chưa seed từ file hiện có

  /** `root`/`maxBytes` để TEST. Mặc định: DIRECTORAI_DATA_DIR | ~/.directorai, 5MB. */
  constructor(
    private readonly rootOverride?: string,
    private readonly maxBytes: number = MAX_BYTES
  ) {}

  private get path(): string {
    if (!this.resolvedPath) {
      // Đọc env LAZY (lúc ghi đầu) → test set DIRECTORAI_DATA_DIR trước record() là đủ.
      const root =
        this.rootOverride ?? process.env.DIRECTORAI_DATA_DIR ?? join(homedir(), '.directorai');
      this.resolvedPath = join(root, 'ops.log');
    }
    return this.resolvedPath;
  }

  private ensureDir(): void {
    if (this.initialized) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
    } catch {
      // best-effort
    }
    try {
      this.bytes = statSync(this.path).size;
    } catch {
      this.bytes = 0;
    }
    this.initialized = true;
  }

  private rotateIfNeeded(addLen: number): void {
    if (this.bytes + addLen <= this.maxBytes) return;
    try {
      renameSync(this.path, `${this.path}.1`); // ghi đè .1 cũ
    } catch {
      // best-effort
    }
    this.bytes = 0;
  }

  record(event: OpsEvent): void {
    this.ensureDir();
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        ...event,
      }) + '\n';
    try {
      this.rotateIfNeeded(line.length);
      appendFileSync(this.path, line, 'utf-8');
      this.bytes += line.length;
    } catch {
      // Swallow — ops log is best-effort, never crash hot path.
    }
  }

  /**
   * P1 — Ghi 1 MUTATION (lệnh sửa timeline) với đủ ngữ cảnh để AUDIT:
   * real/mock, params (ý định), result (kết quả thực), thời gian, lỗi.
   */
  recordMutation(m: {
    rid: string;
    method: string;
    adapter: 'real' | 'mock';
    ok: boolean;
    durationMs: number;
    params?: unknown;
    result?: unknown;
    error?: string;
  }): void {
    this.record({
      event: m.ok ? 'mutate' : 'mutate.error',
      rid: m.rid,
      method: m.method,
      adapter: m.adapter,
      ok: m.ok,
      durationMs: m.durationMs,
      ...(m.params !== undefined ? { params: lean(m.params) } : {}),
      ...(m.ok && m.result !== undefined ? { result: lean(m.result) } : {}),
      ...(m.error ? { error: m.error } : {}),
      ...(m.adapter === 'mock' ? { mockWarning: 'KHÔNG đụng timeline thật' } : {}),
    });
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

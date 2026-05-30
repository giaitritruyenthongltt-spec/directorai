/**
 * Server-side progress bus (P4.02).
 *
 * Tracks in-flight operations and:
 *   - Emits `ProgressEvent` to registered listeners (the ws-server
 *     forwards them as JSON-RPC notifications to the originating
 *     socket).
 *   - Hands out an `AbortSignal` per op so the dispatcher / executor
 *     can short-circuit (P4.03 wires this in).
 *   - Accepts a `cancel(opId)` call so a `progress.cancel` request from
 *     the panel rolls into AbortController.abort().
 *
 * The bus does NOT know about WebSockets. The ws-server owns the
 * socket↔opId mapping and uses `onEvent()` to forward.
 */

import { EventEmitter } from 'node:events';
import { newProgressOpId, type ProgressEvent, type ProgressOpId } from '@directorai/shared';

interface OpRecord {
  readonly opId: ProgressOpId;
  readonly method: string;
  readonly controller: AbortController;
  readonly startedAt: number;
}

export type ProgressListener = (evt: ProgressEvent) => void;

export class ProgressBus {
  private readonly emitter = new EventEmitter();
  private readonly ops = new Map<ProgressOpId, OpRecord>();

  /**
   * Start a tracked operation. Returns the opId and an AbortSignal the
   * dispatcher should plumb into the actual work. Emits a `start`
   * event synchronously.
   */
  start(
    method: string,
    opts?: { total?: number; opId?: ProgressOpId }
  ): {
    opId: ProgressOpId;
    signal: AbortSignal;
  } {
    const opId = opts?.opId ?? newProgressOpId();
    const controller = new AbortController();
    const startedAt = Date.now();
    this.ops.set(opId, { opId, method, controller, startedAt });
    this.emitter.emit('event', {
      kind: 'start',
      opId,
      method,
      total: opts?.total,
      startedAt,
    } satisfies ProgressEvent);
    return { opId, signal: controller.signal };
  }

  /**
   * Push an interim progress update. No-op if the op was already ended.
   */
  update(opId: ProgressOpId, done: number, opts?: { total?: number; label?: string }): void {
    if (!this.ops.has(opId)) return;
    this.emitter.emit('event', {
      kind: 'update',
      opId,
      done,
      total: opts?.total,
      label: opts?.label,
      at: Date.now(),
    } satisfies ProgressEvent);
  }

  /**
   * Mark an op as finished. Idempotent — repeated calls are dropped.
   */
  end(opId: ProgressOpId, status: 'completed' | 'cancelled' | 'error', error?: string): void {
    const rec = this.ops.get(opId);
    if (!rec) return;
    this.ops.delete(opId);
    this.emitter.emit('event', {
      kind: 'end',
      opId,
      status,
      error,
      endedAt: Date.now(),
    } satisfies ProgressEvent);
  }

  /**
   * Request cancellation. Returns true if the op existed (will abort);
   * false if the op was unknown (already ended or never started).
   *
   * Note: this does NOT emit `end` — the dispatcher emits `end` once
   * the cancellable work has actually rolled back.
   */
  cancel(opId: ProgressOpId): boolean {
    const rec = this.ops.get(opId);
    if (!rec) return false;
    rec.controller.abort();
    return true;
  }

  /** Inspect an op (used by tests + recovery). */
  get(opId: ProgressOpId): { method: string; startedAt: number } | undefined {
    const r = this.ops.get(opId);
    if (!r) return undefined;
    return { method: r.method, startedAt: r.startedAt };
  }

  /** Currently in-flight count. */
  get inflight(): number {
    return this.ops.size;
  }

  /** Subscribe to all events. Returns an unsubscribe fn. */
  onEvent(listener: ProgressListener): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}

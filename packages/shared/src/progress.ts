/**
 * Progress bus protocol (P4.02 + P4.03 + P4.04).
 *
 * The server emits these as JSON-RPC notifications on the `progress.event`
 * method to the socket that initiated the operation. The panel
 * subscribes through `wsClient.onProgress(...)` and renders.
 *
 * Cancellation flows the other way: the panel sends a JSON-RPC request
 * with method `progress.cancel` and `params: { opId }`. The server's
 * progress bus calls AbortController.abort() on the matching op and the
 * dispatcher unwinds with `RpcErrorCode.CANCELLED`.
 */

export type ProgressOpId = string;

export interface ProgressStart {
  readonly kind: 'start';
  readonly opId: ProgressOpId;
  readonly method: string;
  readonly total?: number;
  readonly startedAt: number;
}

export interface ProgressUpdate {
  readonly kind: 'update';
  readonly opId: ProgressOpId;
  readonly done: number;
  readonly total?: number;
  readonly label?: string;
  readonly at: number;
}

export interface ProgressEnd {
  readonly kind: 'end';
  readonly opId: ProgressOpId;
  readonly status: 'completed' | 'cancelled' | 'error';
  readonly error?: string;
  readonly endedAt: number;
}

export type ProgressEvent = ProgressStart | ProgressUpdate | ProgressEnd;

export const PROGRESS_NOTIFICATION_METHOD = 'progress.event';
export const PROGRESS_CANCEL_METHOD = 'progress.cancel';

export interface ProgressCancelParams {
  readonly opId: ProgressOpId;
}

export function newProgressOpId(): ProgressOpId {
  const rand = Math.random().toString(36).slice(2, 10);
  return `op_${Date.now().toString(36)}_${rand}`;
}

export function isProgressEvent(e: unknown): e is ProgressEvent {
  if (typeof e !== 'object' || e === null) return false;
  const k = (e as ProgressEvent).kind;
  return k === 'start' || k === 'update' || k === 'end';
}

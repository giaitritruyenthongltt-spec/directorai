/**
 * P4.05 — Reconnect state machine.
 *
 * Pure module (no socket dependency) so it's testable in Node. The
 * actual WebSocket plumbing in ws-client.ts drives it via the events:
 *
 *   machine.onOpen()       — when ws emits 'open'
 *   machine.onClose()      — when ws emits 'close' or 'error'
 *   machine.onPong()       — when any inbound message arrives
 *
 * The machine answers:
 *
 *   machine.state          — current state
 *   machine.nextDelay()    — exponential backoff + jitter, advances attempt
 *   machine.shouldReconnect() — true unless we explicitly disconnected
 *   machine.pongOverdue(now) — true if pingIntervalMs + pongTimeoutMs has
 *                              passed since the last inbound message
 */

export type ReconnectState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface ReconnectConfig {
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffFactor: number;
  /** 0..1 — fraction of the computed delay added/subtracted randomly. */
  readonly jitter: number;
  readonly pingIntervalMs: number;
  readonly pongTimeoutMs: number;
}

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  backoffFactor: 2,
  jitter: 0.2,
  pingIntervalMs: 25_000,
  pongTimeoutMs: 10_000,
};

export class ReconnectMachine {
  private _state: ReconnectState = 'idle';
  private _attempt = 0;
  private _lastInboundAt = 0;
  private _explicitClose = false;

  constructor(
    private readonly cfg: ReconnectConfig = DEFAULT_RECONNECT_CONFIG,
    private readonly random: () => number = Math.random
  ) {}

  get state(): ReconnectState {
    return this._state;
  }

  get attempt(): number {
    return this._attempt;
  }

  beginConnect(): void {
    this._state = 'connecting';
    this._explicitClose = false;
  }

  onOpen(now = Date.now()): void {
    this._state = 'connected';
    this._attempt = 0;
    this._lastInboundAt = now;
  }

  onMessage(now = Date.now()): void {
    this._lastInboundAt = now;
  }

  onClose(): void {
    if (this._explicitClose) {
      this._state = 'closed';
      return;
    }
    this._state = 'reconnecting';
  }

  /** Caller-initiated permanent close — no more reconnects. */
  shutdown(): void {
    this._explicitClose = true;
    this._state = 'closed';
  }

  shouldReconnect(): boolean {
    return !this._explicitClose && this._state !== 'connected';
  }

  /**
   * Compute the next backoff delay in ms, then advance the attempt
   * counter. Bounded to [initial, max] with ±jitter applied
   * symmetrically.
   */
  nextDelay(): number {
    const base = Math.min(
      this.cfg.initialDelayMs * this.cfg.backoffFactor ** this._attempt,
      this.cfg.maxDelayMs
    );
    const jitterMag = base * this.cfg.jitter;
    const offset = (this.random() * 2 - 1) * jitterMag; // -jitterMag .. +jitterMag
    const withJitter = Math.max(0, Math.round(base + offset));
    this._attempt++;
    return withJitter;
  }

  pongOverdue(now = Date.now()): boolean {
    if (this._state !== 'connected') return false;
    if (this._lastInboundAt === 0) return false;
    return now - this._lastInboundAt > this.cfg.pingIntervalMs + this.cfg.pongTimeoutMs;
  }
}

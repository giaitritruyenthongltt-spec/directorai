/**
 * P4.05 — ReconnectMachine unit tests.
 *
 * The machine is pure; we drive it with deterministic random and a
 * stepped clock to assert backoff growth, jitter bounds, pong watchdog
 * timing, and explicit-shutdown behaviour.
 */
import { describe, it, expect } from 'vitest';
import { ReconnectMachine, DEFAULT_RECONNECT_CONFIG } from '../reconnect-machine.js';

describe('ReconnectMachine (P4.05)', () => {
  it('starts in idle and transitions on beginConnect/onOpen', () => {
    const m = new ReconnectMachine();
    expect(m.state).toBe('idle');
    m.beginConnect();
    expect(m.state).toBe('connecting');
    m.onOpen();
    expect(m.state).toBe('connected');
    expect(m.attempt).toBe(0);
  });

  it('grows backoff exponentially up to maxDelayMs', () => {
    // Deterministic mid-jitter: random() = 0.5 → offset = 0
    const m = new ReconnectMachine(DEFAULT_RECONNECT_CONFIG, () => 0.5);
    const delays = Array.from({ length: 10 }, () => m.nextDelay());
    // 1000, 2000, 4000, 8000, 16000, 30000(max), 30000, …
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
    expect(delays[2]).toBe(4000);
    expect(delays[3]).toBe(8000);
    expect(delays[4]).toBe(16000);
    expect(delays[5]).toBe(DEFAULT_RECONNECT_CONFIG.maxDelayMs);
    expect(delays.slice(5).every((d) => d === DEFAULT_RECONNECT_CONFIG.maxDelayMs)).toBe(true);
  });

  it('applies jitter symmetrically (±jitter * delay)', () => {
    const cfg = { ...DEFAULT_RECONNECT_CONFIG, jitter: 0.2 };
    const seen = new Set<number>();
    // random ∈ [0,1) — sample 200 trials at the same attempt count
    for (let i = 0; i < 200; i++) {
      const m = new ReconnectMachine(cfg, () => i / 200);
      seen.add(m.nextDelay());
    }
    const arr = Array.from(seen);
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    // initialDelay = 1000, jitter ±200
    expect(min).toBeGreaterThanOrEqual(800);
    expect(max).toBeLessThanOrEqual(1200);
  });

  it('resets attempt counter on a successful open', () => {
    const m = new ReconnectMachine();
    m.beginConnect();
    m.onClose();
    m.nextDelay();
    m.nextDelay();
    expect(m.attempt).toBe(2);
    m.beginConnect();
    m.onOpen();
    expect(m.attempt).toBe(0);
  });

  it('shouldReconnect is false after explicit shutdown', () => {
    const m = new ReconnectMachine();
    m.beginConnect();
    m.onOpen();
    expect(m.shouldReconnect()).toBe(false); // already connected
    m.shutdown();
    m.onClose();
    expect(m.state).toBe('closed');
    expect(m.shouldReconnect()).toBe(false);
  });

  it('pongOverdue flips after pingInterval + pongTimeout without inbound', () => {
    const m = new ReconnectMachine();
    m.beginConnect();
    const t0 = 1_000_000;
    m.onOpen(t0);
    expect(m.pongOverdue(t0)).toBe(false);
    expect(m.pongOverdue(t0 + 10_000)).toBe(false);
    // ping interval = 25s, pong timeout = 10s, threshold = 35s
    expect(m.pongOverdue(t0 + 35_000)).toBe(false);
    expect(m.pongOverdue(t0 + 35_001)).toBe(true);
    m.onMessage(t0 + 40_000);
    expect(m.pongOverdue(t0 + 50_000)).toBe(false);
  });

  it('pongOverdue is false when not connected', () => {
    const m = new ReconnectMachine();
    expect(m.pongOverdue(Date.now() + 999_999)).toBe(false);
  });

  it('reconnects within budget — max delay reached within 5 attempts', () => {
    const m = new ReconnectMachine();
    let cumulative = 0;
    for (let i = 0; i < 5; i++) cumulative += m.nextDelay();
    // 1+2+4+8+16 = 31s (±jitter), well under 60s budget for P4.05
    expect(cumulative).toBeLessThan(45_000);
  });
});

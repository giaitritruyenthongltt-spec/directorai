/**
 * P4.08 chaos — server is closed under a connected client; the
 * ReconnectMachine should schedule a reconnect with exponential
 * backoff and succeed once the server comes back.
 *
 * This test exercises the *machine*, not the panel UI: we drive the
 * machine like the ws-client does (beginConnect → onOpen → onClose →
 * nextDelay → beginConnect) and assert the timing budget.
 */
import { describe, it, expect } from 'vitest';
import {
  ReconnectMachine,
  DEFAULT_RECONNECT_CONFIG,
} from '../../apps/panel/src/bridge/reconnect-machine.js';

describe('chaos: server restart (P4.08)', () => {
  it('reconnect budget — 5 attempts complete in under 60s of wall-clock backoff', () => {
    const m = new ReconnectMachine(DEFAULT_RECONNECT_CONFIG, () => 0.5);
    m.beginConnect();
    m.onOpen();
    m.onClose();
    let cumulative = 0;
    for (let i = 0; i < 5; i++) cumulative += m.nextDelay();
    expect(cumulative).toBeLessThan(60_000);
  });

  it('shutdown halts further reconnects', () => {
    const m = new ReconnectMachine();
    m.beginConnect();
    m.onOpen();
    m.shutdown();
    m.onClose();
    expect(m.state).toBe('closed');
    expect(m.shouldReconnect()).toBe(false);
  });

  it('pong overdue forces reconnect path', () => {
    const m = new ReconnectMachine();
    m.beginConnect();
    const t0 = 1_000_000;
    m.onOpen(t0);
    const cfg = DEFAULT_RECONNECT_CONFIG;
    expect(m.pongOverdue(t0 + cfg.pingIntervalMs + cfg.pongTimeoutMs + 1)).toBe(true);
  });
});

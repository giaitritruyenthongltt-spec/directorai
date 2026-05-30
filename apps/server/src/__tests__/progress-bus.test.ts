import { describe, it, expect, vi } from 'vitest';
import { ProgressBus } from '../progress-bus.js';
import type { ProgressEvent } from '@directorai/shared';

describe('ProgressBus (P4.02)', () => {
  it('emits start → update → end in order to subscribers', () => {
    const bus = new ProgressBus();
    const seen: ProgressEvent[] = [];
    bus.onEvent((evt) => seen.push(evt));

    const { opId } = bus.start('timeline.cutClip', { total: 3 });
    bus.update(opId, 1, { total: 3, label: 'step 1' });
    bus.update(opId, 2, { total: 3, label: 'step 2' });
    bus.end(opId, 'completed');

    expect(seen.map((e) => e.kind)).toEqual(['start', 'update', 'update', 'end']);
    expect(seen[0]).toMatchObject({ kind: 'start', method: 'timeline.cutClip', total: 3 });
    expect(seen[1]).toMatchObject({ kind: 'update', done: 1, label: 'step 1' });
    expect(seen[3]).toMatchObject({ kind: 'end', status: 'completed' });
  });

  it('returns an AbortSignal that flips on cancel()', () => {
    const bus = new ProgressBus();
    const { opId, signal } = bus.start('long.op');
    expect(signal.aborted).toBe(false);

    const cancelled = bus.cancel(opId);
    expect(cancelled).toBe(true);
    expect(signal.aborted).toBe(true);
  });

  it('cancel() returns false for unknown ops', () => {
    const bus = new ProgressBus();
    expect(bus.cancel('op_does_not_exist')).toBe(false);
  });

  it('update() and end() are no-ops after the op has ended', () => {
    const bus = new ProgressBus();
    const events: ProgressEvent[] = [];
    bus.onEvent((e) => events.push(e));

    const { opId } = bus.start('x');
    bus.end(opId, 'completed');
    bus.update(opId, 99); // dropped
    bus.end(opId, 'cancelled'); // dropped

    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
  });

  it('tracks in-flight count', () => {
    const bus = new ProgressBus();
    expect(bus.inflight).toBe(0);
    const a = bus.start('a');
    const b = bus.start('b');
    expect(bus.inflight).toBe(2);
    bus.end(a.opId, 'completed');
    expect(bus.inflight).toBe(1);
    bus.cancel(b.opId);
    bus.end(b.opId, 'cancelled');
    expect(bus.inflight).toBe(0);
  });

  it('unsubscribe stops further events', () => {
    const bus = new ProgressBus();
    const listener = vi.fn();
    const unsub = bus.onEvent(listener);
    const { opId } = bus.start('x');
    unsub();
    bus.update(opId, 1);
    bus.end(opId, 'completed');
    // exactly 1 event (the start) before unsub
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('accepts a pre-generated opId (used by clients passing their own correlation id)', () => {
    const bus = new ProgressBus();
    const { opId } = bus.start('x', { opId: 'op_test_xyz' });
    expect(opId).toBe('op_test_xyz');
    expect(bus.get(opId)?.method).toBe('x');
  });
});

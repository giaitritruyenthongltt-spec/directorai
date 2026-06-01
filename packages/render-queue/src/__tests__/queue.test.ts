import { describe, it, expect } from 'vitest';
import { InMemoryBackend, RenderQueue, quoteBillingCents, type Job } from '../index.js';

const counter = (): (() => string) => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;
};

describe('RenderQueue (P5.05b)', () => {
  it('enqueue → next → done lifecycle', async () => {
    const q = new RenderQueue({ backend: new InMemoryBackend(), uuid: counter() });
    const job = await q.enqueue({ kind: 'transcribe', payload: { url: 'x' } });
    expect(job.status).toBe('queued');
    const done = await q.runOne(async (j: Job) => {
      expect(j.kind).toBe('transcribe');
      return { costMinutes: 3 };
    });
    expect(done?.status).toBe('done');
    expect(done?.costMinutes).toBe(3);
  });

  it('runOne records failure with error message', async () => {
    const q = new RenderQueue({ backend: new InMemoryBackend(), uuid: counter() });
    await q.enqueue({ kind: 'scene', payload: {} });
    const failed = await q.runOne(async () => {
      throw new Error('GPU exhausted');
    });
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBe('GPU exhausted');
  });

  it('cancel flips status + finishedAt', async () => {
    const q = new RenderQueue({ backend: new InMemoryBackend(), uuid: counter() });
    const job = await q.enqueue({ kind: 'beats', payload: {} });
    const cancelled = await q.cancel(job.id);
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.finishedAt).toBeTruthy();
  });

  it('runOne returns null when queue empty', async () => {
    const q = new RenderQueue({ backend: new InMemoryBackend(), uuid: counter() });
    expect(await q.runOne(async () => ({}))).toBeNull();
  });

  it('list filters by status', async () => {
    const q = new RenderQueue({ backend: new InMemoryBackend(), uuid: counter() });
    await q.enqueue({ kind: 'a', payload: {} });
    const j2 = await q.enqueue({ kind: 'b', payload: {} });
    await q.cancel(j2.id);
    expect((await q.list({ status: 'queued' })).length).toBe(1);
    expect((await q.list({ status: 'cancelled' })).length).toBe(1);
  });

  it('attempts counter increments', async () => {
    const q = new RenderQueue({ backend: new InMemoryBackend(), uuid: counter() });
    const job = await q.enqueue({ kind: 'x', payload: {} });
    await q.runOne(async () => ({}));
    const after = await q.status(job.id);
    expect(after?.attempts).toBe(1);
  });
});

describe('billing (P5.05d)', () => {
  it('passes through minutes × rate × markup', () => {
    expect(quoteBillingCents(10)).toBe(Math.ceil(10 * 2 * 1.5));
  });
  it('enforces 1-minute floor', () => {
    expect(quoteBillingCents(0.5)).toBe(quoteBillingCents(1));
  });
  it('honours overrides', () => {
    expect(quoteBillingCents(60, { providerCentsPerMin: 5, markup: 1, minimumMinutes: 1 })).toBe(
      300
    );
  });
});

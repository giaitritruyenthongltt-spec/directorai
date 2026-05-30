/**
 * P4.13 — Telemetry RPC tests.
 *
 * Uses a temp-file consent store so the test doesn't touch the user's
 * home directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConsentStore, InMemorySink, TelemetryClient } from '@directorai/telemetry';
import { createTelemetryRouter } from '../telemetry-router.js';

const noop = (..._args: unknown[]): void => void _args;
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: (): never => silentLogger as never,
};

describe('telemetry router (P4.13)', () => {
  let dir: string;
  let consentFile: string;
  let consent: ConsentStore;
  let sink: InMemorySink;
  let client: TelemetryClient;
  let router: ReturnType<typeof createTelemetryRouter>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'da-tel-'));
    consentFile = path.join(dir, 'consent.json');
    consent = new ConsentStore(consentFile);
    sink = new InMemorySink();
    const consented = false;
    client = new TelemetryClient({ sink, isEnabled: () => consented });
    router = createTelemetryRouter({
      logger: silentLogger as never,
      client,
      sink,
      consent,
    });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('exposes 4 methods', () => {
    expect(router.listMethods()).toHaveLength(4);
  });

  it('consent.get returns "not asked" record on first call', async () => {
    const rec = (await router.dispatch('telemetry.consent.get', {})) as { consented: null };
    expect(rec.consented).toBeNull();
  });

  it('consent.set true → record updated', async () => {
    const rec = (await router.dispatch('telemetry.consent.set', {
      value: true,
    })) as { consented: boolean };
    expect(rec.consented).toBe(true);
  });

  it('delete wipes sink and resets consent', async () => {
    await router.dispatch('telemetry.consent.set', { value: true });
    sink.emit({
      installId: '00000000-0000-4000-8000-000000000000',
      ts: '2026-05-30T00:00:00.000Z',
      appVersion: '0.6.0',
      platform: 'win32',
      name: 'app.launched',
    } as never);
    expect(sink.size).toBe(1);

    const ack = (await router.dispatch('telemetry.delete', {})) as { ok: boolean };
    expect(ack.ok).toBe(true);
    expect(sink.size).toBe(0);

    const rec = (await router.dispatch('telemetry.consent.get', {})) as {
      consented: boolean | null;
      deletedAt: number | null;
    };
    expect(rec.consented).toBe(false);
    expect(rec.deletedAt).not.toBeNull();
  });

  it('status reports sink size + enabled state', async () => {
    await router.dispatch('telemetry.consent.set', { value: true });
    const s = (await router.dispatch('telemetry.status', {})) as {
      enabled: boolean;
      eventCount: number;
    };
    expect(s.enabled).toBe(true);
    expect(typeof s.eventCount).toBe('number');
  });
});

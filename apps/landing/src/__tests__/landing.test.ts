/**
 * P4.35 — landing tests.
 *
 * Boots the server on port 0, fires real HTTP requests, asserts
 * waitlist persists + Discord webhook gets pinged when configured.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startLanding, type RunningLanding } from '../server.js';
import { WaitlistStore } from '../waitlist-store.js';

function fetchJson(
  url: string,
  init?: { method?: string; body?: string }
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: init?.method ?? 'GET',
        headers: { 'content-type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* keep raw */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (init?.body) req.write(init.body);
    req.end();
  });
}

describe('landing P4.35', () => {
  let dir: string;
  let storeFile: string;
  let store: WaitlistStore;
  let app: RunningLanding;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'da-land-'));
    storeFile = path.join(dir, 'waitlist.jsonl');
    store = new WaitlistStore(storeFile);
  });

  afterEach(async () => {
    await app?.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('serves the landing HTML at /', async () => {
    app = await startLanding({ port: 0, store });
    const res = await fetchJson(`http://127.0.0.1:${app.port}/`);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
    expect(res.body as string).toContain('DirectorAI');
    expect(res.body as string).toContain('Request beta access');
  });

  it('healthz returns ok', async () => {
    app = await startLanding({ port: 0, store });
    const res = await fetchJson(`http://127.0.0.1:${app.port}/healthz`);
    expect(res.status).toBe(200);
    expect(res.body).toBe('ok');
  });

  it('POST /api/waitlist appends and increments count', async () => {
    app = await startLanding({ port: 0, store });
    const sign = await fetchJson(`http://127.0.0.1:${app.port}/api/waitlist`, {
      method: 'POST',
      body: JSON.stringify({ email: 'beta@example.com' }),
    });
    expect(sign.status).toBe(200);
    expect((sign.body as { count: number }).count).toBe(1);

    const all = await store.readAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.email).toBe('beta@example.com');
    expect(all[0]!.source).toBe('landing');
  });

  it('rejects invalid email with 400', async () => {
    app = await startLanding({ port: 0, store });
    const res = await fetchJson(`http://127.0.0.1:${app.port}/api/waitlist`, {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain('email');
  });

  it('pings Discord webhook when configured', async () => {
    let pinged: { url: string; body: string } | null = null;
    const fakeFetch = (async (url: string, init?: { body?: string }) => {
      pinged = { url, body: init?.body ?? '' };
      return new Response('ok');
    }) as unknown as typeof fetch;

    app = await startLanding({
      port: 0,
      store,
      discordWebhookUrl: 'https://discord.example/hook',
      fetcher: fakeFetch,
    });
    await fetchJson(`http://127.0.0.1:${app.port}/api/waitlist`, {
      method: 'POST',
      body: JSON.stringify({ email: 'p@x.com' }),
    });
    expect(pinged).not.toBeNull();
    const sent = pinged as unknown as { url: string; body: string };
    expect(sent.url).toBe('https://discord.example/hook');
    expect(sent.body).toContain('p@x.com');
  });

  it('count endpoint dedupes by lowercase email', async () => {
    app = await startLanding({ port: 0, store });
    for (const email of ['a@x.com', 'A@X.com', 'b@x.com']) {
      await fetchJson(`http://127.0.0.1:${app.port}/api/waitlist`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    }
    const res = await fetchJson(`http://127.0.0.1:${app.port}/api/waitlist/count`);
    expect((res.body as { count: number }).count).toBe(2);
  });
});

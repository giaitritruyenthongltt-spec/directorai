import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { startMarketplaceApi, type RunningMarketplaceApi } from '../server.js';
import { type Pack } from '@directorai/marketplace';

function fetchJson(
  port: number,
  path: string,
  init: { method?: string; body?: unknown; admin?: string } = {}
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: init.method ?? 'GET',
        headers: {
          'content-type': 'application/json',
          ...(init.admin ? { 'x-admin-token': init.admin } : {}),
        },
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
    if (init.body !== undefined)
      req.write(typeof init.body === 'string' ? init.body : JSON.stringify(init.body));
    req.end();
  });
}

const samplePack: Pack = {
  id: 'com.example.test',
  name: 'Test',
  description: 'test pack',
  authorId: '00000000-0000-4000-8000-000000000001',
  version: '1.0.0',
  priceUsdCents: 999,
  stripePriceId: 'price_test',
  bundleSha256: 'a'.repeat(64),
  bundleUrl: 'https://example.com/p.zip',
  featured: false,
  tags: ['vlog'],
  publishedAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('marketplace-api (P5.02b)', () => {
  let app: RunningMarketplaceApi;

  beforeAll(async () => {
    app = await startMarketplaceApi({ port: 0, adminToken: 'admin-test' });
    await app.store.savePack(samplePack);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz', async () => {
    const r = await fetchJson(app.port, '/healthz');
    expect(r.status).toBe(200);
  });

  it('GET /api/packs lists', async () => {
    const r = await fetchJson(app.port, '/api/packs');
    expect(r.status).toBe(200);
    expect((r.body as { packs: Pack[] }).packs[0]!.id).toBe(samplePack.id);
  });

  it('GET /api/packs?tag filters', async () => {
    const hit = await fetchJson(app.port, '/api/packs?tag=vlog');
    const miss = await fetchJson(app.port, '/api/packs?tag=zzz');
    expect((hit.body as { packs: Pack[] }).packs.length).toBe(1);
    expect((miss.body as { packs: Pack[] }).packs.length).toBe(0);
  });

  it('GET /api/packs/:id 404 when missing', async () => {
    const r = await fetchJson(app.port, '/api/packs/com.example.nope');
    expect(r.status).toBe(404);
  });

  it('POST /api/packs requires admin', async () => {
    const r = await fetchJson(app.port, '/api/packs', { method: 'POST', body: samplePack });
    expect(r.status).toBe(401);
  });

  it('POST /api/packs accepts admin + persists', async () => {
    const pack: Pack = { ...samplePack, id: 'com.example.two' };
    const r = await fetchJson(app.port, '/api/packs', {
      method: 'POST',
      body: pack,
      admin: 'admin-test',
    });
    expect(r.status).toBe(200);
    expect(await app.store.getPack('com.example.two')).not.toBeNull();
  });

  it('POST /api/packs/:id/feature flips the flag (admin)', async () => {
    await fetchJson(app.port, `/api/packs/${samplePack.id}/feature`, {
      method: 'POST',
      body: { featured: true },
      admin: 'admin-test',
    });
    const p = await app.store.getPack(samplePack.id);
    expect(p?.featured).toBe(true);
  });

  it('POST /api/checkout/:packId returns stub session URL', async () => {
    const r = await fetchJson(app.port, `/api/checkout/${samplePack.id}`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect((r.body as { sessionUrl: string }).sessionUrl).toContain(samplePack.id);
  });

  it('POST review then list', async () => {
    const post = await fetchJson(app.port, `/api/packs/${samplePack.id}/reviews`, {
      method: 'POST',
      body: {
        id: '33333333-3333-4333-8333-333333333333',
        authorEmail: 'r@x.com',
        rating: 5,
        body: 'great',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    });
    expect(post.status).toBe(200);
    const list = await fetchJson(app.port, `/api/packs/${samplePack.id}/reviews`);
    expect((list.body as { reviews: unknown[] }).reviews.length).toBe(1);
  });

  it('rejects invalid review', async () => {
    const r = await fetchJson(app.port, `/api/packs/${samplePack.id}/reviews`, {
      method: 'POST',
      body: { rating: 99 },
    });
    expect(r.status).toBe(400);
  });
});

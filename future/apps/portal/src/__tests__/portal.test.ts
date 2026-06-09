/**
 * P4.21 — Portal smoke test.
 *
 * Boots the portal on a free port, posts a real signed license, and
 * asserts the verifier round-trips. Uses `node:http` client.
 */
import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { generateLicenseKeypair, signLicense, type LicensePayload } from '@directorai/license';
import { startPortal } from '../server.js';

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
            /* keep as string */
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

describe('portal stub (P4.21)', () => {
  it('verifies a real signed license via /api/license/verify', async () => {
    const { privateKey, publicKey } = generateLicenseKeypair();
    const portal = await startPortal({ port: 0, publicKeyPem: publicKey });
    try {
      const payload: LicensePayload = {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'test@example.com',
        sku: 'pro',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 86_400_000,
      };
      const license = signLicense(payload, privateKey);
      const res = (await fetchJson(`http://127.0.0.1:${portal.port}/api/license/verify`, {
        method: 'POST',
        body: JSON.stringify({ license }),
      })) as { status: number; body: { ok: boolean; payload?: { sku: string } } };
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.payload?.sku).toBe('pro');
    } finally {
      await portal.close();
    }
  });

  it('404 on unknown route', async () => {
    const { publicKey } = generateLicenseKeypair();
    const portal = await startPortal({ port: 0, publicKeyPem: publicKey });
    try {
      const res = await fetchJson(`http://127.0.0.1:${portal.port}/nope`);
      expect(res.status).toBe(404);
    } finally {
      await portal.close();
    }
  });
});

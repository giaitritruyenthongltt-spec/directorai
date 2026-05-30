import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import {
  generateLicenseKeypair,
  MemoryMailer,
  signLicense,
  type LicensePayload,
} from '@directorai/license';
import { createLicenseRouter } from '../license-router.js';

const noop = (..._args: unknown[]): void => void _args;
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: (): never => silentLogger as never,
};

function stripeSign(payload: string, secret: string, ts: number): string {
  const hmac = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${hmac}`;
}

describe('license router (P4.18 + P4.19 + P4.20)', () => {
  let dir: string;
  let stateFile: string;
  let publicKey: string;
  let privateKey: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'da-lic-'));
    stateFile = path.join(dir, 'license.json');
    const kp = generateLicenseKeypair();
    publicKey = kp.publicKey;
    privateKey = kp.privateKey;
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reports "no license" initially and persists after activate', async () => {
    const router = await createLicenseRouter({
      logger: silentLogger as never,
      publicKeyPem: publicKey,
      statePath: stateFile,
    });

    const before = (await router.dispatch('license.status', {})) as {
      ok: boolean;
      reason?: string;
    };
    expect(before.ok).toBe(false);

    const payload: LicensePayload = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'a@example.com',
      sku: 'pro',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    };
    const license = signLicense(payload, privateKey);

    const after = (await router.dispatch('license.activate', { license })) as {
      ok: boolean;
    };
    expect(after.ok).toBe(true);

    // Persistence — new router instance reads it back
    const router2 = await createLicenseRouter({
      logger: silentLogger as never,
      publicKeyPem: publicKey,
      statePath: stateFile,
    });
    const recheck = (await router2.dispatch('license.status', {})) as { ok: boolean };
    expect(recheck.ok).toBe(true);
  });

  it('Stripe webhook with no issuer returns 503', async () => {
    const router = await createLicenseRouter({
      logger: silentLogger as never,
      publicKeyPem: publicKey,
      statePath: stateFile,
    });
    const res = await router.handleStripeWebhook({ payload: '{}', header: 't=1,v1=x' });
    expect(res.status).toBe(503);
  });

  it('Stripe webhook end-to-end: signed event → license email', async () => {
    const mailer = new MemoryMailer();
    const router = await createLicenseRouter({
      logger: silentLogger as never,
      publicKeyPem: publicKey,
      statePath: stateFile,
      issuing: {
        privateKeyPem: privateKey,
        mailer,
        stripeWebhookSecret: 'whsec_test',
      },
    });

    const ts = Math.floor(Date.now() / 1000);
    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer_email: 'buyer@example.com',
          metadata: { sku: 'pro' },
        },
      },
      created: ts,
    };
    const payload = JSON.stringify(event);
    const header = stripeSign(payload, 'whsec_test', ts);

    const res = await router.handleStripeWebhook({ payload, header });
    expect(res.status).toBe(200);
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]!.to).toBe('buyer@example.com');
    expect(mailer.outbox[0]!.text).toMatch(/DA1\./);
  });

  it('Stripe webhook with bad signature returns 400', async () => {
    const mailer = new MemoryMailer();
    const router = await createLicenseRouter({
      logger: silentLogger as never,
      publicKeyPem: publicKey,
      statePath: stateFile,
      issuing: {
        privateKeyPem: privateKey,
        mailer,
        stripeWebhookSecret: 'whsec_test',
      },
    });

    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
    const header = stripeSign(payload, 'whsec_OTHER', ts);

    const res = await router.handleStripeWebhook({ payload, header });
    expect(res.status).toBe(400);
    expect(mailer.outbox).toHaveLength(0);
  });
});

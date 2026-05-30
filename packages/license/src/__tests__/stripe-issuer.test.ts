import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  generateLicenseKeypair,
  verifyLicense,
  verifyStripeWebhook,
  LicenseIssuer,
  MemoryMailer,
} from '../index.js';

function stripeSign(payload: string, secret: string, ts: number): string {
  const hmac = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${hmac}`;
}

describe('Stripe webhook verify (P4.18)', () => {
  const secret = 'whsec_test';
  const now = 1_700_000_000;
  const payload = JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { customer_email: 'buyer@example.com', metadata: { sku: 'pro' } } },
    created: now,
  });

  it('accepts a well-formed signed payload', () => {
    const header = stripeSign(payload, secret, now);
    const res = verifyStripeWebhook({ payload, header, secret, now: () => now });
    expect(res.ok).toBe(true);
    expect(res.event?.type).toBe('checkout.session.completed');
  });

  it('rejects a stale timestamp', () => {
    const stale = now - 1000;
    const header = stripeSign(payload, secret, stale);
    const res = verifyStripeWebhook({
      payload,
      header,
      secret,
      toleranceSec: 60,
      now: () => now,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/tolerance/);
  });

  it('rejects bad signature', () => {
    const header = stripeSign(payload, 'whsec_other', now);
    const res = verifyStripeWebhook({ payload, header, secret, now: () => now });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/mismatch/);
  });

  it('rejects malformed header', () => {
    const res = verifyStripeWebhook({
      payload,
      header: 'garbage',
      secret,
      now: () => now,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/malformed/);
  });
});

describe('LicenseIssuer pipeline (P4.19)', () => {
  it('mints a signed license and mails it', async () => {
    const { privateKey, publicKey } = generateLicenseKeypair();
    const mailer = new MemoryMailer();
    const issuer = new LicenseIssuer({ privateKeyPem: privateKey, mailer });

    const result = await issuer.issue({ email: 'buyer@example.com', sku: 'pro' });

    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]!.to).toBe('buyer@example.com');
    expect(mailer.outbox[0]!.text).toContain(result.licenseString);

    const verify = verifyLicense(result.licenseString, publicKey);
    expect(verify.ok).toBe(true);
    expect(verify.payload?.sku).toBe('pro');
  });

  it('subscription SKU expires sooner than pro', async () => {
    const { privateKey } = generateLicenseKeypair();
    const issuer = new LicenseIssuer({ privateKeyPem: privateKey, mailer: new MemoryMailer() });
    const pro = await issuer.issue({ email: 'test@example.com', sku: 'pro' });
    const sub = await issuer.issue({ email: 'test@example.com', sku: 'subscription' });
    expect(sub.payload.expiresAt).toBeLessThan(pro.payload.expiresAt);
  });
});

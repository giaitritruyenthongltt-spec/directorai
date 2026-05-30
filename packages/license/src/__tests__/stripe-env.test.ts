import { describe, it, expect } from 'vitest';
import { detectStripeMode, checkStripeEnv } from '../index.js';

describe('detectStripeMode (P4.41)', () => {
  it('classifies sk_test_, sk_live_, rk_test_, rk_live_, unknown', () => {
    expect(detectStripeMode('sk_test_abc')).toBe('test');
    expect(detectStripeMode('sk_live_abc')).toBe('live');
    expect(detectStripeMode('rk_test_abc')).toBe('test');
    expect(detectStripeMode('rk_live_abc')).toBe('live');
    expect(detectStripeMode('pk_live_abc')).toBe('unknown');
    expect(detectStripeMode(undefined)).toBe('unknown');
    expect(detectStripeMode('')).toBe('unknown');
  });
});

describe('checkStripeEnv (P4.41)', () => {
  it('passes when prod + live keys + whsec all match', () => {
    const res = checkStripeEnv({
      appEnv: 'production',
      secretKey: 'sk_live_xxx',
      webhookSecret: 'whsec_abc',
      priceIds: ['price_basic', 'price_pro'],
    });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('live');
    expect(res.errors).toEqual([]);
  });

  it('blocks prod + test keys', () => {
    const res = checkStripeEnv({
      appEnv: 'production',
      secretKey: 'sk_test_xxx',
      webhookSecret: 'whsec_abc',
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /test Stripe keys/.test(e))).toBe(true);
  });

  it('blocks non-prod + live keys (safety net)', () => {
    const res = checkStripeEnv({
      appEnv: 'staging',
      secretKey: 'sk_live_xxx',
      webhookSecret: 'whsec_abc',
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /live Stripe keys/.test(e))).toBe(true);
  });

  it('warns (not errors) when keys absent in dev', () => {
    const res = checkStripeEnv({ appEnv: 'development' });
    expect(res.ok).toBe(true);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('errors when keys absent in prod', () => {
    const res = checkStripeEnv({ appEnv: 'production' });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('errors on malformed webhook secret', () => {
    const res = checkStripeEnv({
      appEnv: 'production',
      secretKey: 'sk_live_xxx',
      webhookSecret: 'not_a_whsec',
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /whsec_/.test(e))).toBe(true);
  });

  it('errors on malformed price id', () => {
    const res = checkStripeEnv({
      appEnv: 'production',
      secretKey: 'sk_live_xxx',
      webhookSecret: 'whsec_abc',
      priceIds: ['nope_basic'],
    });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => /Invalid price id/.test(e))).toBe(true);
  });
});

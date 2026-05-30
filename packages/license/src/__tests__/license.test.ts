import { describe, it, expect } from 'vitest';
import {
  generateLicenseKeypair,
  signLicense,
  verifyLicense,
  LicenseVerifier,
  type LicensePayload,
} from '../index.js';

function mkPayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    sku: 'pro',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
    ...overrides,
  };
}

describe('License sign / verify (P4.17)', () => {
  it('round-trips a signed payload', () => {
    const { privateKey, publicKey } = generateLicenseKeypair();
    const payload = mkPayload();
    const license = signLicense(payload, privateKey);
    expect(license.startsWith('DA1.')).toBe(true);
    const res = verifyLicense(license, publicKey);
    expect(res.ok).toBe(true);
    expect(res.payload?.email).toBe('user@example.com');
  });

  it('detects tampered payload', () => {
    const { privateKey, publicKey } = generateLicenseKeypair();
    const license = signLicense(mkPayload(), privateKey);
    // Flip a character in the payload section
    const parts = license.split('.');
    const tampered = `${parts[0]}.${parts[1]!.slice(0, -1)}A.${parts[2]}`;
    const res = verifyLicense(tampered, publicKey);
    expect(res.ok).toBe(false);
  });

  it('rejects wrong version prefix', () => {
    const { privateKey, publicKey } = generateLicenseKeypair();
    const license = signLicense(mkPayload(), privateKey);
    const wrong = license.replace(/^DA1/, 'DA0');
    const res = verifyLicense(wrong, publicKey);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/version/);
  });

  it('rejects expired license', () => {
    const { privateKey, publicKey } = generateLicenseKeypair();
    const license = signLicense(mkPayload({ expiresAt: Date.now() - 1_000 }), privateKey);
    const res = verifyLicense(license, publicKey);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('expired');
  });

  it('rejects mismatched key', () => {
    const a = generateLicenseKeypair();
    const b = generateLicenseKeypair();
    const license = signLicense(mkPayload(), a.privateKey);
    const res = verifyLicense(license, b.publicKey);
    expect(res.ok).toBe(false);
  });
});

describe('LicenseVerifier offline grace (P4.20)', () => {
  it('returns no license when none set', () => {
    const { publicKey } = generateLicenseKeypair();
    const v = new LicenseVerifier({ publicKeyPem: publicKey });
    const s = v.status();
    expect(s.ok).toBe(false);
    expect(s.reason).toBe('no license');
    expect(s.withinGrace).toBe(false);
  });

  it('withinGrace becomes true after recordOnlineActivation', () => {
    const { privateKey, publicKey } = generateLicenseKeypair();
    const v = new LicenseVerifier({ publicKeyPem: publicKey });
    const license = signLicense(mkPayload(), privateKey);
    v.recordOnlineActivation(license);
    expect(v.isValid()).toBe(true);
  });

  it('locks after offline window expires', () => {
    const { privateKey, publicKey } = generateLicenseKeypair();
    let now = 1_000_000_000;
    const v = new LicenseVerifier({
      publicKeyPem: publicKey,
      offlineGraceMs: 1000,
      now: () => now,
    });
    const license = signLicense(mkPayload({ expiresAt: 9_999_999_999_999 }), privateKey);
    v.recordOnlineActivation(license);
    now += 500;
    expect(v.isValid()).toBe(true);
    now += 1000; // grace exhausted
    expect(v.isValid()).toBe(false);
    const s = v.status();
    expect(s.withinGrace).toBe(false);
    expect(s.ok).toBe(true); // signature is still fine, just past grace
  });

  it('hydrate + snapshot round-trip', () => {
    const { privateKey, publicKey } = generateLicenseKeypair();
    const v1 = new LicenseVerifier({ publicKeyPem: publicKey });
    const license = signLicense(mkPayload(), privateKey);
    v1.recordOnlineActivation(license);
    const snap = v1.snapshot();
    const v2 = new LicenseVerifier({ publicKeyPem: publicKey });
    v2.hydrate(snap);
    expect(v2.isValid()).toBe(true);
  });
});

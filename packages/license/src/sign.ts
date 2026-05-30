/**
 * P4.17 — Ed25519 sign + verify for licenses.
 *
 * The signer lives in an offline tool (only the holder of the
 * private key runs it — typically the Stripe webhook handler). The
 * verifier ships with the panel + server and uses only the public
 * key.
 */
import { sign, verify, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { LICENSE_VERSION, LicensePayloadSchema, type LicensePayload } from './schema.js';

const b64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Generate an Ed25519 keypair as PEM strings. Use in the offline issuer. */
export function generateLicenseKeypair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/** Sign a payload. `privateKeyPem` is the PKCS8 PEM string. */
export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
  LicensePayloadSchema.parse(payload);
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const key = createPrivateKey({ key: privateKeyPem });
  const signature = sign(null, json, key);
  return `${LICENSE_VERSION}.${b64url(json)}.${b64url(signature)}`;
}

export interface VerifyResult {
  ok: boolean;
  payload?: LicensePayload;
  reason?: string;
}

/** Verify a compact license string. `publicKeyPem` is the SPKI PEM string. */
export function verifyLicense(licenseString: string, publicKeyPem: string): VerifyResult {
  const parts = licenseString.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed (need 3 parts)' };
  const [ver, payloadB64, sigB64] = parts as [string, string, string];
  if (ver !== LICENSE_VERSION) return { ok: false, reason: `wrong version "${ver}"` };

  let rawPayload: Buffer;
  let rawSig: Buffer;
  try {
    rawPayload = fromB64url(payloadB64);
    rawSig = fromB64url(sigB64);
  } catch {
    return { ok: false, reason: 'base64 decode failed' };
  }

  let parsed: LicensePayload;
  try {
    const obj = JSON.parse(rawPayload.toString('utf8'));
    parsed = LicensePayloadSchema.parse(obj);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'payload parse failed' };
  }

  const key = createPublicKey({ key: publicKeyPem });
  const signatureOk = verify(null, rawPayload, key, rawSig);
  if (!signatureOk) return { ok: false, reason: 'signature mismatch' };

  if (parsed.expiresAt < Date.now()) {
    return { ok: false, reason: 'expired', payload: parsed };
  }

  return { ok: true, payload: parsed };
}

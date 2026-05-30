/**
 * P4.18 — Stripe webhook signature verification.
 *
 * Implements Stripe's HMAC-SHA256 signature scheme without taking a
 * runtime dependency on `stripe` — the package is heavy and the
 * webhook handler only needs the verifier path.
 *
 *   t=1234567890,v1=hex_signature
 *
 * The signed payload is `${timestamp}.${rawBody}`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  created: number;
}

export interface VerifyWebhookOptions {
  /** Raw request body bytes — must NOT be JSON-parsed first. */
  payload: string;
  /** `Stripe-Signature` header value. */
  header: string;
  /** Endpoint secret, from Stripe dashboard. Starts with `whsec_`. */
  secret: string;
  /** Max age of the event in seconds. Default 5 min (Stripe recommended). */
  toleranceSec?: number;
  /** Clock injection for tests. */
  now?: () => number;
}

export interface VerifyWebhookResult {
  ok: boolean;
  event?: StripeWebhookEvent;
  reason?: string;
}

const DEFAULT_TOLERANCE = 300;

export function verifyStripeWebhook(opts: VerifyWebhookOptions): VerifyWebhookResult {
  const tolerance = opts.toleranceSec ?? DEFAULT_TOLERANCE;
  const now = opts.now ? opts.now() : Math.floor(Date.now() / 1000);

  const parts = opts.header.split(',').map((s) => s.trim());
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const sigParts = parts.filter((p) => p.startsWith('v1='));
  if (!timestampPart || sigParts.length === 0) {
    return { ok: false, reason: 'malformed signature header' };
  }
  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'bad timestamp' };
  if (Math.abs(now - timestamp) > tolerance) {
    return { ok: false, reason: 'timestamp outside tolerance' };
  }

  const signed = `${timestamp}.${opts.payload}`;
  const expected = createHmac('sha256', opts.secret).update(signed).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  const ok = sigParts.some((p) => {
    const got = p.slice(3);
    if (got.length !== expected.length) return false;
    try {
      return timingSafeEqual(expectedBuf, Buffer.from(got, 'utf8'));
    } catch {
      return false;
    }
  });

  if (!ok) return { ok: false, reason: 'signature mismatch' };

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(opts.payload) as StripeWebhookEvent;
  } catch {
    return { ok: false, reason: 'payload not JSON' };
  }
  return { ok: true, event };
}

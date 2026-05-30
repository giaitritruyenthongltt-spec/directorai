/**
 * P4.18 + P4.19 — Server-side license + Stripe routes.
 *
 *   RPC (panel):
 *     license.status                     → VerifierStatus
 *     license.activate { license }       → VerifierStatus
 *     license.clear                      → VerifierStatus
 *
 *   HTTP (Stripe POST):
 *     handleStripeWebhook(rawBody, sig)  → 200 + ack | 400 + reason
 *
 * The router doesn't bind to an HTTP server itself — it returns a
 * `handleStripeWebhook` callable so the boot code can plug into
 * whatever HTTP layer ships (today: none — wired in the marketing
 * site infra). For automated tests we just invoke that function
 * directly.
 */
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Logger } from '@directorai/shared';
import {
  LicenseIssuer,
  LicenseVerifier,
  verifyStripeWebhook,
  type Mailer,
  type LicenseSku,
  type VerifierStatus,
  type StripeWebhookEvent,
} from '@directorai/license';

const ActivateParams = z.object({ license: z.string().min(10) });
const EmptyParams = z.object({}).optional();

export interface LicenseRouterOptions {
  logger: Logger;
  /** Public key (PEM SPKI) compiled in or loaded at boot. */
  publicKeyPem: string;
  /** Persistent state path. Default ~/.directorai/license.json */
  statePath?: string;
  /** Issuer + Stripe pair — only required for the webhook path. */
  issuing?: {
    privateKeyPem: string;
    mailer: Mailer;
    stripeWebhookSecret: string;
  };
}

interface SavedState {
  licenseString: string | null;
  lastOnlineCheckAt: number | null;
}

const DEFAULT_PATH = path.join(os.homedir(), '.directorai', 'license.json');

export interface LicenseRouter {
  listMethods(): readonly string[];
  dispatch(method: string, params: unknown): Promise<unknown>;
  /** Stripe webhook entry point. Caller passes raw body + header. */
  handleStripeWebhook(opts: {
    payload: string;
    header: string;
  }): Promise<{ status: number; body: unknown }>;
  /** Test helper — exposes the verifier. */
  readonly verifier: LicenseVerifier;
}

export async function createLicenseRouter(opts: LicenseRouterOptions): Promise<LicenseRouter> {
  const verifier = new LicenseVerifier({ publicKeyPem: opts.publicKeyPem });
  const statePath = opts.statePath ?? DEFAULT_PATH;

  // Hydrate from disk if present
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const saved = JSON.parse(raw) as SavedState;
    verifier.hydrate(saved);
  } catch {
    // No prior state — fine
  }

  const persist = async (): Promise<void> => {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(verifier.snapshot(), null, 2), 'utf8');
  };

  const handlers: Record<string, (p: unknown) => Promise<VerifierStatus>> = {
    'license.status': async () => verifier.status(),
    'license.activate': async (p) => {
      const { license } = ActivateParams.parse(p ?? {});
      verifier.recordOnlineActivation(license);
      await persist();
      return verifier.status();
    },
    'license.clear': async () => {
      verifier.setLicense(null);
      await persist();
      return verifier.status();
    },
  };

  const issuer = opts.issuing
    ? new LicenseIssuer({
        privateKeyPem: opts.issuing.privateKeyPem,
        mailer: opts.issuing.mailer,
      })
    : null;

  const handleStripeWebhook = async (input: {
    payload: string;
    header: string;
  }): Promise<{ status: number; body: unknown }> => {
    if (!opts.issuing || !issuer) {
      return { status: 503, body: { error: 'issuer not configured' } };
    }
    const res = verifyStripeWebhook({
      payload: input.payload,
      header: input.header,
      secret: opts.issuing.stripeWebhookSecret,
    });
    if (!res.ok || !res.event) {
      opts.logger.warn({ reason: res.reason }, 'stripe webhook rejected');
      return { status: 400, body: { error: res.reason ?? 'unknown' } };
    }
    if (!supportedEvent(res.event)) {
      return { status: 200, body: { acknowledged: true, ignored: res.event.type } };
    }
    const { email, sku } = readBuyer(res.event);
    if (!email || !sku) {
      return { status: 422, body: { error: 'missing email or sku in event' } };
    }
    const issued = await issuer.issue({ email, sku });
    opts.logger.info(
      { sku, messageId: issued.messageId, payloadId: issued.payload.id },
      'license issued'
    );
    return { status: 200, body: { acknowledged: true, payloadId: issued.payload.id } };
  };

  EmptyParams.parse({}); // silence unused
  return {
    listMethods: () => Object.keys(handlers),
    dispatch: async (method, params) => {
      const fn = handlers[method];
      if (!fn) throw new Error(`Unknown license method: ${method}`);
      return fn(params);
    },
    handleStripeWebhook,
    verifier,
  };
}

function supportedEvent(e: StripeWebhookEvent): boolean {
  return e.type === 'checkout.session.completed' || e.type === 'customer.subscription.created';
}

function readBuyer(e: StripeWebhookEvent): { email?: string; sku?: LicenseSku } {
  const obj = e.data.object;
  const email =
    (obj['customer_email'] as string | undefined) ??
    (obj['customer_details'] as { email?: string } | undefined)?.email;
  const metaSku =
    (obj['metadata'] as { sku?: string } | undefined)?.sku ?? (obj['mode'] as string | undefined);
  const sku: LicenseSku | undefined =
    metaSku === 'basic' || metaSku === 'pro' || metaSku === 'subscription' ? metaSku : undefined;
  return { email, sku };
}

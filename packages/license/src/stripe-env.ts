/**
 * P4.41 — Stripe mode detection + sanity checks.
 *
 * Stripe keys are prefixed `sk_test_` / `sk_live_` and webhook
 * secrets `whsec_…`. We detect mode from the prefix and fail-fast
 * if the deployment claims production but is wired to test keys
 * (or vice-versa). Prevents the classic "we accidentally launched
 * with test keys and processed real cards" miss.
 */

export type StripeMode = 'test' | 'live' | 'unknown';

export function detectStripeMode(secretKey: string | undefined): StripeMode {
  if (!secretKey) return 'unknown';
  if (secretKey.startsWith('sk_test_')) return 'test';
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('rk_test_')) return 'test';
  if (secretKey.startsWith('rk_live_')) return 'live';
  return 'unknown';
}

export interface StripeEnvCheck {
  ok: boolean;
  mode: StripeMode;
  /** Issues found that should block deploy. */
  errors: string[];
  /** Soft warnings (e.g. webhook secret looks wrong but not blocking). */
  warnings: string[];
}

export interface StripeEnvInput {
  /** `NODE_ENV` (or equivalent) — production / staging / development. */
  appEnv: string;
  secretKey?: string;
  webhookSecret?: string;
  /** Optional list of expected price IDs (`price_…`). */
  priceIds?: readonly string[];
}

/**
 * Validate the Stripe env block. The boot script should call this
 * during startup and exit non-zero on `!ok`.
 */
export function checkStripeEnv(input: StripeEnvInput): StripeEnvCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mode = detectStripeMode(input.secretKey);
  const isProd = input.appEnv === 'production';

  if (!input.secretKey) {
    if (isProd) errors.push('STRIPE_SECRET_KEY missing in production');
    else warnings.push('STRIPE_SECRET_KEY not set (license issuer disabled)');
  } else if (mode === 'unknown') {
    errors.push(`STRIPE_SECRET_KEY has unrecognized prefix (expected sk_test_ or sk_live_)`);
  } else if (isProd && mode === 'test') {
    errors.push('Production deployment is using test Stripe keys (sk_test_*).');
  } else if (!isProd && mode === 'live') {
    errors.push('Non-production deployment is using live Stripe keys — refusing to start.');
  }

  if (!input.webhookSecret) {
    if (isProd) errors.push('STRIPE_WEBHOOK_SECRET missing in production');
    else warnings.push('STRIPE_WEBHOOK_SECRET not set (webhook handler disabled)');
  } else if (!input.webhookSecret.startsWith('whsec_')) {
    errors.push('STRIPE_WEBHOOK_SECRET is missing the "whsec_" prefix');
  }

  if (input.priceIds) {
    for (const pid of input.priceIds) {
      if (!pid.startsWith('price_')) {
        errors.push(`Invalid price id "${pid}" — must start with "price_"`);
      }
    }
  }

  return { ok: errors.length === 0, mode, errors, warnings };
}

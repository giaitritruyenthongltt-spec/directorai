/**
 * V5 smoke test — verify Stripe env is wired correctly.
 *
 * Run AFTER:
 *   - You signed up at stripe.com and finished bank/tax verification.
 *   - You set STRIPE_SECRET_KEY (sk_test_… for dev) + STRIPE_WEBHOOK_SECRET (whsec_…)
 *     in your env.
 *
 *   pnpm smoke:stripe
 *
 * What it does:
 *   - Runs `checkStripeEnv` (P4.41 implementation).
 *   - Reports mode (test/live/unknown), errors, warnings.
 *   - Returns exit 0 only when env is consistent.
 *
 * Does NOT make a live API call — we don't want to charge cards just
 * to verify config. For a real end-to-end purchase test see
 * docs/guides/stripe-live-checklist.md → "Test the live wire".
 */
import { checkStripeEnv, detectStripeMode } from '../packages/license/src/stripe-env.js';

const env = {
  appEnv: process.env.NODE_ENV ?? 'development',
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  // Price IDs are optional — only validate if user set them
  priceIds: ['STRIPE_PRICE_BASIC', 'STRIPE_PRICE_PRO', 'STRIPE_PRICE_SUB']
    .map((k) => process.env[k])
    .filter((v): v is string => Boolean(v)),
};

console.info(`appEnv=${env.appEnv}`);
console.info(`mode=${detectStripeMode(env.secretKey)}`);
console.info(`secretKey set: ${env.secretKey ? 'yes' : 'no'}`);
console.info(`webhookSecret set: ${env.webhookSecret ? 'yes' : 'no'}`);
console.info(`priceIds provided: ${env.priceIds.length}`);
console.info('');

const result = checkStripeEnv(env);

if (result.warnings.length) {
  console.warn('Warnings:');
  for (const w of result.warnings) console.warn(`  ⚠ ${w}`);
  console.warn('');
}
if (result.errors.length) {
  console.error('Errors:');
  for (const e of result.errors) console.error(`  ❌ ${e}`);
  console.error('');
  console.error(`❌ FAIL — Stripe env has ${result.errors.length} blocker(s).`);
  process.exit(1);
}

console.info(`✅ PASS — Stripe env consistent (mode: ${result.mode}).`);
if (result.mode === 'test') {
  console.info('');
  console.info('Next: run an actual test-mode purchase via the Stripe Payment Link');
  console.info('and confirm the webhook fires + a license email is generated.');
  console.info('See docs/guides/stripe-live-checklist.md.');
}

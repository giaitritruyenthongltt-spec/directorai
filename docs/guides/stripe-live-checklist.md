# Stripe live-mode cutover (P4.41)

The license code is mode-agnostic — flipping from test to live is
99% configuration. This checklist is the 1% that's easy to miss.

## Before the flip

- [ ] Stripe account is **verified** (bank, tax form, identity).
- [ ] 3 prices created in Stripe dashboard: - `price_basic_one_time` → $9.99 - `price_pro_one_time` → $109 - `price_sub_monthly` → $19/mo
- [ ] Each price's metadata has a `sku` field (`basic` / `pro` /
      `subscription`).
- [ ] Payment Links generated for each price (Dashboard → Payment
      Links → New). Save the URLs.
- [ ] Webhook endpoint configured in Stripe → Developers → Webhooks:
      `https://api.directorai.app/webhook/stripe`. Subscribe to
      `checkout.session.completed` and
      `customer.subscription.created`.
- [ ] Webhook signing secret copied (starts with `whsec_…`).
- [ ] Live `sk_live_…` and `whsec_…` saved in your secrets manager
      (1Password, AWS Secrets Manager, …).
- [ ] Refund policy enabled (Settings → Customer emails →
      Successful payments + Refunds).

## Env switch

Production env (e.g. Fly.io / Render / your runner):

```
NODE_ENV=production
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
DIRECTORAI_LICENSE_PRIVATE_KEY=...   # signing key, keep secret
DIRECTORAI_LICENSE_PUBLIC_KEY=...    # bundled in the panel too
MAILER=postmark                      # or ses / resend
POSTMARK_API_KEY=...
```

The boot script calls `checkStripeEnv()` (see
`packages/license/src/stripe-env.ts`). It will refuse to start if
production has `sk_test_*` keys or if the webhook secret lacks the
`whsec_` prefix — this catches the classic mis-deploy.

## Test the live wire

1. Buy your own license at $9.99 (Basic). Use a real card.
2. Watch the server logs — you should see `license issued` with the
   payload id.
3. Check inbox: the issuer email arrives within ~60s with the
   `DA1.…` key.
4. Paste the key into the panel → activate → status flips to live.
5. Refund yourself in the Stripe dashboard. The license stays
   active until `expiresAt`, but the refund flow is exercised.

## Rollback

If anything goes wrong:

1. Flip `STRIPE_SECRET_KEY` back to `sk_test_xxx` in production
   secrets. `checkStripeEnv` will refuse to start until you also
   change `NODE_ENV=staging` (or roll forward to fix). This is the
   safety net.
2. The webhook handler returns 503 when issuer is unconfigured —
   Stripe will retry for 3 days, no payments are lost.
3. Manually issue licenses for any successful purchase via
   `tools/issue-license.ts` (owner-completed: write the script
   only if you actually need it; the issuer module is reusable).

## Owner-completed

The env values + Stripe configuration steps are owner-completed.
Once they're in place, no code changes — `checkStripeEnv()` makes
the cutover detectable in CI / boot logs.

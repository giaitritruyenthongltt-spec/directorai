/**
 * P5.05d — Per-minute billing pass-through.
 *
 * Pure pricing function: minutes × ratePerMinuteCents × markup, with
 * a small floor. Used by the worker on job completion to compute
 * Stripe usage record amounts.
 *
 * Defaults: $0.02/min provider cost × 1.5 markup = $0.03/min retail.
 * 1-minute floor so 5-second jobs aren't free.
 */

export interface BillingInput {
  /** Cost-side per-minute rate, in cents. */
  providerCentsPerMin?: number;
  /** Retail markup multiplier (1.0 = pass-through). */
  markup?: number;
  /** Don't bill less than this many minutes. */
  minimumMinutes?: number;
}

const DEFAULTS = {
  providerCentsPerMin: 2,
  markup: 1.5,
  minimumMinutes: 1,
};

export function quoteBillingCents(minutes: number, input: BillingInput = {}): number {
  const m = Math.max(minutes, input.minimumMinutes ?? DEFAULTS.minimumMinutes);
  const rate =
    (input.providerCentsPerMin ?? DEFAULTS.providerCentsPerMin) * (input.markup ?? DEFAULTS.markup);
  return Math.ceil(m * rate);
}

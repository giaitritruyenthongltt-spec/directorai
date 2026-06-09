/**
 * P5.02a — Marketplace data model.
 *
 * The marketplace is "Style Pack" centric: a Pack is one or more
 * `.style` YAML files + metadata + optional preview clip + author.
 * Authors are first-class so the 70/30 revenue split can route.
 * Sales + Reviews are immutable append-only records.
 *
 * All schemas Zod-validated. The marketplace API (P5.02b) accepts
 * only these shapes; the panel installer (P5.02e) emits only these
 * shapes; the admin curation tooling (P5.02f) reads only these
 * shapes. Schema drift is impossible without a deliberate bump.
 */
import { z } from 'zod';

export const PackIdSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, 'must be reverse-dns (e.g. com.example.cinematic-pack)');

export const AuthorSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(80),
  email: z.string().email(),
  /** Stripe Connect Express account id (acct_…). Empty until activated. */
  stripeConnectId: z.string().startsWith('acct_').or(z.literal('')),
  homepage: z.string().url().optional(),
  joinedAt: z.string().datetime(),
});
export type Author = z.infer<typeof AuthorSchema>;

export const PackVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, 'semver x.y.z[-pre]');

export const PackSchema = z.object({
  id: PackIdSchema,
  name: z.string().min(1).max(80),
  description: z.string().max(500),
  authorId: z.string().uuid(),
  version: PackVersionSchema,
  /** Cents. 0 = free pack. */
  priceUsdCents: z.number().int().nonnegative(),
  /** Stripe Price id (price_…). Required for non-free packs. */
  stripePriceId: z.string().startsWith('price_').or(z.literal('')),
  /** SHA-256 of the bundled .zip. Verified at install. */
  bundleSha256: z.string().regex(/^[0-9a-f]{64}$/i),
  /** CDN URL to the bundle. */
  bundleUrl: z.string().url(),
  /** Optional preview clip URL shown on the listing. */
  previewUrl: z.string().url().optional(),
  /** Curated flag — set by the admin (P5.02f). */
  featured: z.boolean().default(false),
  /** Tags for marketplace search. */
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  publishedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Pack = z.infer<typeof PackSchema>;

export const SaleSchema = z.object({
  id: z.string().uuid(),
  packId: PackIdSchema,
  buyerEmail: z.string().email(),
  /** Cents at time of sale. */
  amountUsdCents: z.number().int().nonnegative(),
  /** Author share at the configured split (default 70). */
  authorShareCents: z.number().int().nonnegative(),
  /** Platform share. */
  platformShareCents: z.number().int().nonnegative(),
  /** Stripe Checkout Session id. */
  stripeSessionId: z.string().startsWith('cs_').optional(),
  soldAt: z.string().datetime(),
});
export type Sale = z.infer<typeof SaleSchema>;

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  packId: PackIdSchema,
  authorEmail: z.string().email(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000),
  createdAt: z.string().datetime(),
});
export type Review = z.infer<typeof ReviewSchema>;

/** Default revenue split. 70% creator / 30% platform. */
export const DEFAULT_REVENUE_SPLIT = { author: 70, platform: 30 } as const;

/** Compute Stripe-rounded shares. Author rounds down; platform takes remainder. */
export function splitRevenue(
  amountCents: number,
  authorPct = DEFAULT_REVENUE_SPLIT.author
): { authorShareCents: number; platformShareCents: number } {
  const authorShareCents = Math.floor((amountCents * authorPct) / 100);
  return {
    authorShareCents,
    platformShareCents: amountCents - authorShareCents,
  };
}

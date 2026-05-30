/**
 * P4.17 — License payload schema.
 *
 * A license is a JSON object signed with Ed25519. The signed payload
 * is base64-encoded together with the signature into a compact
 * string the user pastes into the panel:
 *
 *   DA1.<base64-payload>.<base64-signature>
 *
 * The version prefix lets us evolve the schema without breaking older
 * licenses.
 */
import { z } from 'zod';

export const LICENSE_VERSION = 'DA1';

export const LicenseSkuSchema = z.enum(['basic', 'pro', 'subscription']);
export type LicenseSku = z.infer<typeof LicenseSkuSchema>;

export const LicensePayloadSchema = z.object({
  /** Stable id (uuid) so revocation lists can reference it. */
  id: z.string().uuid(),
  /** Buyer email at purchase time. Used for support and reissue. */
  email: z.string().email(),
  sku: LicenseSkuSchema,
  /** Epoch ms when this license was issued. */
  issuedAt: z.number().int().positive(),
  /**
   * Epoch ms when the license expires. For one-time purchases this
   * is the support window cutoff (24 months by default). For
   * subscription it tracks the current period; the next renewal will
   * issue a fresh license.
   */
  expiresAt: z.number().int().positive(),
  /**
   * Optional install-id binding. Empty means "machine-portable".
   * Filled when the buyer activated on a specific machine.
   */
  installId: z.string().uuid().optional(),
});

export type LicensePayload = z.infer<typeof LicensePayloadSchema>;

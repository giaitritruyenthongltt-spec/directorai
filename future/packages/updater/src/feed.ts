/**
 * P4.26 — Auto-update feed protocol.
 *
 * The publisher hosts a JSON manifest at a stable URL (e.g.
 * `https://updates.directorai.app/win/stable.json`) describing the
 * latest available installer:
 *
 *   {
 *     "version": "0.7.1",
 *     "url": "https://…/DirectorAI-0.7.1.msi",
 *     "sha256": "hex",
 *     "minSupportedVersion": "0.5.0",
 *     "notes": "…"
 *   }
 *
 * The updater fetches this on a timer (default daily) and, when a
 * newer version is available, downloads to a temp file, verifies the
 * SHA-256, and stages it. The MSI is applied on next launch.
 */
import { z } from 'zod';

export const UpdateManifestSchema = z.object({
  version: z.string(),
  url: z.string().url(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
  minSupportedVersion: z.string().optional(),
  releasedAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export type UpdateManifest = z.infer<typeof UpdateManifestSchema>;

/**
 * Lexical semver compare for `a.b.c[.d…]`. Returns -1 / 0 / 1.
 * Pre-release tags (`-beta`, `-rc`) are stripped before comparison;
 * we deliberately don't support full semver pre-release ordering
 * because our release stream is stable-only.
 */
export function compareVersions(a: string, b: string): number {
  const norm = (v: string): number[] =>
    v
      .replace(/[-+].+$/, '')
      .split('.')
      .map((p) => Number(p) || 0);
  const pa = norm(a);
  const pb = norm(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * P5.01c — Plugin manifest schema.
 *
 * Every plugin ships a `manifest.json` next to its entry point.
 * The host validates it on load; missing fields, unknown permissions,
 * or invalid version strings refuse to load.
 *
 *   plugins/
 *     style-cinematic-pack/
 *       manifest.json    ← validated by PluginManifestSchema
 *       index.js         ← entry, exports { activate, deactivate? }
 *
 * Permissions are a closed enum so we can audit + sandbox. Adding
 * a permission is a deliberate ADR decision.
 */
import { z } from 'zod';

/**
 * The closed set of permissions a plugin can request. The host
 * enforces these at the `PluginContext` boundary — a plugin that
 * doesn't declare `premiere:write` cannot call mutating RPCs.
 */
export const PluginPermissionSchema = z.enum([
  /** Read-only Premiere RPC methods (project/timeline/marker.*). */
  'premiere:read',
  /** Mutating Premiere RPC methods. */
  'premiere:write',
  /** Context engine RPCs (transcribe, scene, beats, search). */
  'context:read',
  /** Register additional built-in styles. */
  'style:register',
  /** Register additional effect presets. */
  'effect:register',
  /** Register MCP tools usable by nl.query. */
  'tool:register',
  /** Emit telemetry events from the plugin namespace. */
  'telemetry:emit',
]);
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;

/**
 * Semver compatibility string for the host. Plugin only activates
 * when the host's `@directorai/sdk` version matches. Examples:
 *   "^1.0.0"   → 1.x.x
 *   "~1.0.0"   → 1.0.x
 *   "1.0.0"    → exact
 */
export const SemverRangeSchema = z
  .string()
  .regex(/^[\^~]?\d+(\.\d+){0,2}(-[\w.]+)?$/, 'must be a semver range like "^1.0.0"');

export const PluginManifestSchema = z.object({
  /** Reverse-DNS id. Must be unique across the plugin install. */
  id: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, 'must be reverse-dns (e.g. com.example.style-pack)'),
  /** Human-readable display name. */
  name: z.string().min(1).max(80),
  /** Plugin's own semver. */
  version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, 'must be x.y.z[-pre]'),
  /** Optional description shown in the host's plugin list. */
  description: z.string().max(280).optional(),
  /** Optional author block. */
  author: z
    .object({
      name: z.string(),
      email: z.string().email().optional(),
      url: z.string().url().optional(),
    })
    .optional(),
  /** Optional homepage / repo URL. */
  homepage: z.string().url().optional(),
  /**
   * Path (relative to the manifest) of the JS file that exports
   * `activate(ctx)` and optionally `deactivate(ctx)`.
   */
  entry: z.string().min(1).default('./index.js'),
  /** Compatible host SDK range. */
  hostSdk: SemverRangeSchema.default('^1.0.0'),
  /** Permission scopes this plugin needs. Empty = read-only observation only. */
  permissions: z.array(PluginPermissionSchema).default([]),
  /**
   * Optional plugin-defined config. The host neither reads nor
   * mutates this; the plugin parses it during `activate`.
   */
  config: z.record(z.unknown()).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/**
 * Parse + validate a manifest object. Throws ZodError on miss —
 * the host's `loadPlugin` translates that into a clean rejection
 * message.
 */
export function parsePluginManifest(raw: unknown): PluginManifest {
  return PluginManifestSchema.parse(raw);
}

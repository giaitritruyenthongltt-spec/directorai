/**
 * P4.12 — Telemetry events catalog.
 *
 * The full list of events DirectorAI may emit. Every event in this
 * file is **opt-in user data with no PII or media content**: only
 * counters, durations, and enumerated labels (style name, error
 * class, tool method name). The schema is enforced at the sink so
 * unknown events are dropped, never silently leaked.
 *
 * The catalog is intentionally capped at 20 entries — adding the 21st
 * forces a deliberate review.
 */
import { z } from 'zod';

const Common = z.object({
  /** Pseudonymous installation id. Generated client-side, stored locally. */
  installId: z.string().uuid(),
  /** ISO timestamp of when the event was produced. */
  ts: z.string().datetime(),
  /** App version + platform. */
  appVersion: z.string(),
  platform: z.enum(['win32', 'darwin', 'linux']),
});

export const TelemetryEventSchemas = {
  /* ---- Lifecycle (4) ---- */
  'app.launched': Common.extend({
    name: z.literal('app.launched'),
    coldStartMs: z.number().nonnegative().optional(),
  }),
  'app.exited': Common.extend({
    name: z.literal('app.exited'),
    sessionDurationSec: z.number().nonnegative(),
    reason: z.enum(['user', 'crash', 'update']),
  }),
  'app.updated': Common.extend({
    name: z.literal('app.updated'),
    from: z.string(),
    to: z.string(),
  }),
  'app.crashed': Common.extend({
    name: z.literal('app.crashed'),
    errorClass: z.string(),
  }),

  /* ---- Connection (3) ---- */
  'panel.connected': Common.extend({
    name: z.literal('panel.connected'),
    attempt: z.number().nonnegative(),
  }),
  'panel.disconnected': Common.extend({
    name: z.literal('panel.disconnected'),
    reason: z.enum(['user', 'timeout', 'server-restart', 'unknown']),
  }),
  'panel.reconnect.budget_exceeded': Common.extend({
    name: z.literal('panel.reconnect.budget_exceeded'),
    attempts: z.number().nonnegative(),
  }),

  /* ---- Tool calls (3) ---- */
  'tool.invoked': Common.extend({
    name: z.literal('tool.invoked'),
    tool: z.string(),
    durationMs: z.number().nonnegative(),
    ok: z.boolean(),
  }),
  'tool.cancelled': Common.extend({
    name: z.literal('tool.cancelled'),
    tool: z.string(),
  }),
  'tool.failed': Common.extend({
    name: z.literal('tool.failed'),
    tool: z.string(),
    errorClass: z.string(),
  }),

  /* ---- Style engine (4) ---- */
  'style.applied': Common.extend({
    name: z.literal('style.applied'),
    style: z.string(),
    stepsOk: z.number().nonnegative(),
    stepsError: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
  'style.dryRun': Common.extend({
    name: z.literal('style.dryRun'),
    style: z.string(),
    steps: z.number().nonnegative(),
  }),
  'style.learner.patched': Common.extend({
    name: z.literal('style.learner.patched'),
    style: z.string(),
    patches: z.number().nonnegative(),
  }),
  'style.checkpoint.restored': Common.extend({
    name: z.literal('style.checkpoint.restored'),
    ageSec: z.number().nonnegative(),
  }),

  /* ---- Context engine (2) ---- */
  'context.ingest.completed': Common.extend({
    name: z.literal('context.ingest.completed'),
    durationMs: z.number().nonnegative(),
    segments: z.number().nonnegative(),
  }),
  'context.search.executed': Common.extend({
    name: z.literal('context.search.executed'),
    resultCount: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),

  /* ---- Licensing (2) — wired in Sprint 3 ---- */
  'license.activated': Common.extend({
    name: z.literal('license.activated'),
    sku: z.enum(['basic', 'pro', 'subscription']),
  }),
  'license.offline_grace_used': Common.extend({
    name: z.literal('license.offline_grace_used'),
    daysOffline: z.number().nonnegative(),
  }),

  /* ---- Consent (2) ---- */
  'consent.opted_in': Common.extend({
    name: z.literal('consent.opted_in'),
  }),
  'consent.deletion_requested': Common.extend({
    name: z.literal('consent.deletion_requested'),
  }),
} as const;

export type TelemetryEventName = keyof typeof TelemetryEventSchemas;

export type TelemetryEvent = {
  [K in TelemetryEventName]: z.infer<(typeof TelemetryEventSchemas)[K]>;
}[TelemetryEventName];

export const TELEMETRY_EVENT_NAMES = Object.keys(
  TelemetryEventSchemas
) as readonly TelemetryEventName[];

/** Validate an event against its named schema. Throws on schema miss. */
export function validateEvent(evt: unknown): TelemetryEvent {
  if (
    typeof evt !== 'object' ||
    evt === null ||
    typeof (evt as { name?: unknown }).name !== 'string'
  ) {
    throw new Error('Telemetry event missing "name" string');
  }
  const name = (evt as { name: string }).name;
  const schema = (TelemetryEventSchemas as Record<string, z.ZodTypeAny>)[name];
  if (!schema) {
    throw new Error(`Unknown telemetry event "${name}" (cap is ${TELEMETRY_EVENT_NAMES.length})`);
  }
  return schema.parse(evt) as TelemetryEvent;
}

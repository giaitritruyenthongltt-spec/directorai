/**
 * @directorai/sdk — the **only** package 3rd-party plugin authors
 * should depend on.
 *
 * ADR-0013 defines the committed public surface. Anything not
 * re-exported here is internal and may break between releases —
 * including peer packages reachable through pnpm symlinks.
 *
 * Quick start (copy-paste):
 *
 *   import {
 *     parsePluginManifest,
 *     getBuiltinStyle,
 *     EFFECT_PRESETS,
 *     type PluginContext,
 *     type PluginModule,
 *   } from '@directorai/sdk';
 *
 *   export async function activate(ctx: PluginContext) {
 *     ctx.logger.info({}, 'hello from my plugin');
 *     const vlog = getBuiltinStyle('vlog');
 *     ctx.registry.registerStyle({ ...vlog, name: 'my-vlog' });
 *   }
 */

// ── Plugin protocol (manifest + lifecycle) ──────────────────────────────────
export {
  PluginManifestSchema,
  PluginPermissionSchema,
  SemverRangeSchema,
  parsePluginManifest,
  type PluginManifest,
  type PluginPermission,
} from './manifest.js';

export {
  PluginPermissionError,
  type PluginContext,
  type PluginLogger,
  type PluginModule,
  type PluginRegistry,
} from './plugin.js';

// ── Core types ──────────────────────────────────────────────────────────────
export type { Seconds, TimeRange, Project, Sequence, Clip, Track } from '@directorai/core';

// ── Style + planning ────────────────────────────────────────────────────────
export {
  parseStyle,
  getBuiltinStyle,
  listBuiltinStyles,
  StyleSchema,
  type Style,
  type StylePatch,
} from '@directorai/style-engine';

export { planCuts, type Plan, type PlanStep, type MediaContext } from '@directorai/cut-planner';

// ── Effect library ──────────────────────────────────────────────────────────
export { EFFECT_PRESETS, type EffectPreset } from '@directorai/effect-library';

// ── Adapter (interface only — NOT the implementations) ──────────────────────
export type { IPremiereAdapter } from '@directorai/premiere-adapter';

// ── LLM tooling (types only) ────────────────────────────────────────────────
export type { LLMToolDef, LLMToolCall, ILLMClient } from '@directorai/llm-client';

// ── Telemetry (events catalog, not the client) ──────────────────────────────
export {
  validateEvent,
  TELEMETRY_EVENT_NAMES,
  type TelemetryEvent,
  type TelemetryEventName,
} from '@directorai/telemetry';

/**
 * SDK version constant. Plugins can compare against this to
 * surface a friendly "you need a newer host" message.
 */
export const SDK_VERSION = '1.0.0';

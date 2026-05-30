/**
 * P5.01d — Plugin runtime interface.
 *
 * Every plugin exports two functions from its entry file:
 *
 *   export async function activate(ctx: PluginContext): Promise<void> { ... }
 *   export async function deactivate?(ctx: PluginContext): Promise<void> { ... }
 *
 * The `PluginContext` is the *only* surface a plugin should reach
 * for. Importing anything else from the workspace is unsupported
 * (see ADR-0013). The context is permission-gated by the host
 * based on the manifest.
 */
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import type { Style, StylePatch } from '@directorai/style-engine';
import type { EffectPreset } from '@directorai/effect-library';
import type { TelemetryEvent } from '@directorai/telemetry';
import type { LLMToolDef } from '@directorai/llm-client';
import type { PluginManifest, PluginPermission } from './manifest.js';

export interface PluginLogger {
  debug(obj: Record<string, unknown> | string, msg?: string): void;
  info(obj: Record<string, unknown> | string, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown> | string, msg?: string): void;
}

/**
 * What a plugin can register back into the host. Each method
 * checks the manifest's permission set; un-permitted calls throw
 * `PluginPermissionError` rather than silently no-op (better
 * developer ergonomics).
 */
export interface PluginRegistry {
  /** Register a new built-in style available alongside vlog/podcast/etc. */
  registerStyle(style: Style | StylePatch): void;
  /** Register an effect preset in addition to EFFECT_PRESETS. */
  registerEffect(preset: EffectPreset): void;
  /** Register an MCP tool usable by nl.query agent loops. */
  registerTool(def: LLMToolDef, handler: (input: unknown) => Promise<string>): void;
}

/**
 * The handle a plugin's `activate(ctx)` receives. Read-only
 * surfaces are always available; write surfaces check
 * permissions at call time.
 */
export interface PluginContext {
  /** The plugin's parsed manifest. */
  readonly manifest: PluginManifest;
  /** Scoped logger; lines are prefixed with the plugin id. */
  readonly logger: PluginLogger;
  /** Adapter handle — read methods always available, mutating gated on `premiere:write`. */
  readonly adapter: IPremiereAdapter;
  /** Register styles/effects/tools back into the host. */
  readonly registry: PluginRegistry;
  /** Emit a telemetry event. No-op when consent is off. Requires `telemetry:emit`. */
  emit(event: TelemetryEvent): void;
  /** Returns true if the manifest declared the permission. */
  has(permission: PluginPermission): boolean;
}

/**
 * What the host expects to find on the entry module. Both
 * lifecycle hooks are async; the host awaits `activate` during
 * startup and `deactivate` during shutdown.
 */
export interface PluginModule {
  activate(ctx: PluginContext): Promise<void> | void;
  deactivate?(ctx: PluginContext): Promise<void> | void;
}

/**
 * Thrown when a plugin calls a context method without the matching
 * permission in its manifest. The plugin should declare the
 * permission in `manifest.json` and reload.
 */
export class PluginPermissionError extends Error {
  override readonly name = 'PluginPermissionError';
  constructor(
    public readonly pluginId: string,
    public readonly needed: PluginPermission,
    public readonly method: string
  ) {
    super(
      `Plugin "${pluginId}" tried to call "${method}" without permission "${needed}". Add "${needed}" to manifest.permissions.`
    );
  }
}

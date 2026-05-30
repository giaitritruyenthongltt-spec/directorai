/**
 * P5.01d — Plugin loader + permission-gated runtime.
 *
 * On boot, the server walks `plugins/<id>/manifest.json`, validates
 * each via `parsePluginManifest`, dynamic-imports the entry module,
 * and calls `activate(ctx)` with a per-plugin `PluginContext`.
 *
 * `PluginContext` is the only surface a plugin sees:
 *   - `adapter` is wrapped so write methods throw
 *     `PluginPermissionError` when the manifest lacks
 *     `premiere:write`.
 *   - `registry.registerStyle/Effect/Tool` route into the host's
 *     stores, gated on the matching permission.
 *   - `emit(event)` falls through to the host's TelemetryClient,
 *     gated on `telemetry:emit`.
 *
 * Loaded plugins are tracked so the boot script can call
 * `deactivate()` on shutdown.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parsePluginManifest,
  PluginPermissionError,
  type EffectPreset,
  type LLMToolDef,
  type PluginContext,
  type PluginManifest,
  type PluginModule,
  type PluginPermission,
  type PluginRegistry,
  type PluginLogger,
  type Style,
  type StylePatch,
  type TelemetryEvent,
} from '@directorai/sdk';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import type { Logger } from '@directorai/shared';

/** RPC method names that mutate state. Mirrors `MUTATING_METHODS` in the dispatcher. */
const MUTATING_ADAPTER_METHODS = new Set<keyof IPremiereAdapter>([
  'setActiveSequence',
  'cutClip',
  'trimClip',
  'moveClip',
  'deleteClip',
  'applyEffect',
  'removeEffect',
  'importFile',
  'addMarker',
  'deleteMarker',
  'exportSequence',
  'addKeyframe',
  'applyColorPreset',
  'setColorParams',
  'setAudioGain',
  'addAudioFade',
  'muteTrack',
  'addTextOverlay',
  'applyTransition',
  'beginUndoGroup',
  'endUndoGroup',
]);

export interface PluginHostHooks {
  /** Called when a plugin registers a style. */
  onStyleRegistered?: (pluginId: string, style: Style | StylePatch) => void;
  /** Called when a plugin registers an effect preset. */
  onEffectRegistered?: (pluginId: string, preset: EffectPreset) => void;
  /** Called when a plugin registers a tool. */
  onToolRegistered?: (
    pluginId: string,
    def: LLMToolDef,
    handler: (input: unknown) => Promise<string>
  ) => void;
  /** Called when a plugin emits a telemetry event. */
  onTelemetryEmit?: (pluginId: string, event: TelemetryEvent) => void;
}

export interface PluginLoaderOptions {
  pluginsDir: string;
  adapter: IPremiereAdapter;
  logger: Logger;
  hooks?: PluginHostHooks;
}

export interface LoadedPlugin {
  readonly manifest: PluginManifest;
  readonly module: PluginModule;
  readonly context: PluginContext;
}

function makeAdapterProxy(raw: IPremiereAdapter, manifest: PluginManifest): IPremiereAdapter {
  const canWrite = manifest.permissions.includes('premiere:write');
  const canRead = manifest.permissions.includes('premiere:read');

  return new Proxy(raw, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const propName = String(prop);
      // gate based on whether this is a mutating method
      const isMutating = MUTATING_ADAPTER_METHODS.has(propName as keyof IPremiereAdapter);
      return (...args: unknown[]) => {
        if (isMutating && !canWrite) {
          throw new PluginPermissionError(manifest.id, 'premiere:write', propName);
        }
        if (!isMutating && !canRead && !canWrite) {
          // Reads still require either premiere:read OR premiere:write.
          throw new PluginPermissionError(manifest.id, 'premiere:read', propName);
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

function makeRegistry(
  manifest: PluginManifest,
  hooks: PluginHostHooks | undefined
): PluginRegistry {
  return {
    registerStyle(style) {
      if (!manifest.permissions.includes('style:register')) {
        throw new PluginPermissionError(manifest.id, 'style:register', 'registerStyle');
      }
      hooks?.onStyleRegistered?.(manifest.id, style);
    },
    registerEffect(preset) {
      if (!manifest.permissions.includes('effect:register')) {
        throw new PluginPermissionError(manifest.id, 'effect:register', 'registerEffect');
      }
      hooks?.onEffectRegistered?.(manifest.id, preset);
    },
    registerTool(def, handler) {
      if (!manifest.permissions.includes('tool:register')) {
        throw new PluginPermissionError(manifest.id, 'tool:register', 'registerTool');
      }
      hooks?.onToolRegistered?.(manifest.id, def, handler);
    },
  };
}

function makeLogger(base: Logger, id: string): PluginLogger {
  const wrap = (level: 'debug' | 'info' | 'warn' | 'error'): PluginLogger[typeof level] => {
    return (obj: Record<string, unknown> | string, msg?: string) => {
      const ctx = typeof obj === 'string' ? { plugin: id, msg: obj } : { plugin: id, ...obj };
      const text = typeof obj === 'string' ? obj : (msg ?? '');
      const fn = (
        base as unknown as Record<string, ((o: unknown, m?: string) => void) | undefined>
      )[level];
      fn?.(ctx, text);
    };
  };
  return { debug: wrap('debug'), info: wrap('info'), warn: wrap('warn'), error: wrap('error') };
}

function buildContext(manifest: PluginManifest, opts: PluginLoaderOptions): PluginContext {
  return {
    manifest,
    logger: makeLogger(opts.logger, manifest.id),
    adapter: makeAdapterProxy(opts.adapter, manifest),
    registry: makeRegistry(manifest, opts.hooks),
    emit(event) {
      if (!manifest.permissions.includes('telemetry:emit')) {
        throw new PluginPermissionError(manifest.id, 'telemetry:emit', 'emit');
      }
      opts.hooks?.onTelemetryEmit?.(manifest.id, event);
    },
    has(permission: PluginPermission) {
      return manifest.permissions.includes(permission);
    },
  };
}

/** Load a single plugin given its directory (containing manifest.json). */
export async function loadPluginFromDir(
  dir: string,
  opts: PluginLoaderOptions
): Promise<LoadedPlugin> {
  const manifestPath = path.join(dir, 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf8');
  const manifest = parsePluginManifest(JSON.parse(raw));
  const entryPath = path.resolve(dir, manifest.entry);
  const module = (await import(pathToFileURL(entryPath).href)) as PluginModule;
  if (typeof module.activate !== 'function') {
    throw new Error(`Plugin ${manifest.id} entry "${manifest.entry}" missing activate()`);
  }
  const context = buildContext(manifest, opts);
  await module.activate(context);
  opts.logger.info({ id: manifest.id, version: manifest.version }, 'plugin activated');
  return { manifest, module, context };
}

/** Discover + load every plugin under `pluginsDir`. Bad plugins log + skip; one bad plugin doesn't break the host. */
export async function loadAllPlugins(opts: PluginLoaderOptions): Promise<LoadedPlugin[]> {
  let entries: string[];
  try {
    const items = await fs.readdir(opts.pluginsDir, { withFileTypes: true });
    entries = items.filter((d) => d.isDirectory()).map((d) => path.join(opts.pluginsDir, d.name));
  } catch {
    opts.logger.info({ dir: opts.pluginsDir }, 'no plugins directory — skipping');
    return [];
  }
  const loaded: LoadedPlugin[] = [];
  for (const dir of entries) {
    try {
      loaded.push(await loadPluginFromDir(dir, opts));
    } catch (err) {
      opts.logger.warn(
        { dir, err: err instanceof Error ? err.message : err },
        'plugin load failed'
      );
    }
  }
  return loaded;
}

/** Best-effort deactivate for a list of plugins (call on graceful shutdown). */
export async function deactivateAll(plugins: readonly LoadedPlugin[]): Promise<void> {
  for (const p of plugins) {
    if (typeof p.module.deactivate === 'function') {
      try {
        await p.module.deactivate(p.context);
      } catch {
        // best-effort
      }
    }
  }
}

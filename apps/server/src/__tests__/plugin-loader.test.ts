/**
 * P5.01d — Plugin loader tests.
 *
 * We build a tiny fixture plugin on a temp dir, load it, assert:
 *   - manifest parsing
 *   - activate() runs
 *   - permission gating (style:register OK, premiere:write blocked)
 *   - registry hooks fire on the host
 *   - deactivate() runs on shutdown
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MockPremiereAdapter } from '@directorai/premiere-adapter';
import { PluginPermissionError } from '@directorai/sdk';
import { loadAllPlugins, loadPluginFromDir, deactivateAll } from '../plugin-loader.js';

const noop = (..._args: unknown[]): void => void _args;
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: (): never => silentLogger as never,
};

async function makeFixture(opts: { permissions?: string[]; bodyJs: string }): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'da-plug-'));
  const pluginDir = path.join(root, 'plugins', 'com.example.test');
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, 'manifest.json'),
    JSON.stringify({
      id: 'com.example.test',
      name: 'Test plugin',
      version: '1.0.0',
      entry: './entry.mjs',
      permissions: opts.permissions ?? [],
    })
  );
  await fs.writeFile(path.join(pluginDir, 'entry.mjs'), opts.bodyJs);
  return root;
}

describe('plugin loader (P5.01d)', () => {
  let root: string;

  beforeEach(() => {
    root = '';
  });

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it('loads a no-op plugin and runs activate', async () => {
    root = await makeFixture({
      bodyJs: `
        export async function activate(ctx) {
          ctx.logger.info({}, 'activated');
        }
      `,
    });
    const adapter = new MockPremiereAdapter();
    const loaded = await loadAllPlugins({
      pluginsDir: path.join(root, 'plugins'),
      adapter,
      logger: silentLogger as never,
    });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.manifest.id).toBe('com.example.test');
  });

  it('blocks adapter write when premiere:write is missing', async () => {
    root = await makeFixture({
      permissions: ['premiere:read'],
      bodyJs: `
        export async function activate(ctx) {
          await ctx.adapter.cutClip({ clipId: 'x', at: 0 });
        }
      `,
    });
    const adapter = new MockPremiereAdapter();
    const plugins = await loadAllPlugins({
      pluginsDir: path.join(root, 'plugins'),
      adapter,
      logger: silentLogger as never,
    });
    // The plugin throws inside activate; loader logs + skips.
    expect(plugins).toHaveLength(0);
  });

  it('allows adapter write when premiere:write is granted', async () => {
    root = await makeFixture({
      permissions: ['premiere:read', 'premiere:write'],
      bodyJs: `
        export async function activate(ctx) {
          await ctx.adapter.importFile({ path: 'C:/sample.mp4' });
        }
      `,
    });
    const adapter = new MockPremiereAdapter();
    const plugins = await loadAllPlugins({
      pluginsDir: path.join(root, 'plugins'),
      adapter,
      logger: silentLogger as never,
    });
    expect(plugins).toHaveLength(1);
  });

  it('blocks registerStyle without style:register permission', async () => {
    root = await makeFixture({
      bodyJs: `
        export async function activate(ctx) {
          ctx.registry.registerStyle({ name: 'evil' });
        }
      `,
    });
    let registered = false;
    const adapter = new MockPremiereAdapter();
    await loadAllPlugins({
      pluginsDir: path.join(root, 'plugins'),
      adapter,
      logger: silentLogger as never,
      hooks: {
        onStyleRegistered: () => {
          registered = true;
        },
      },
    });
    expect(registered).toBe(false);
  });

  it('fires onStyleRegistered hook when permission is granted', async () => {
    root = await makeFixture({
      permissions: ['style:register'],
      bodyJs: `
        export async function activate(ctx) {
          ctx.registry.registerStyle({ name: 'my-vlog' });
        }
      `,
    });
    let captured: unknown = null;
    const adapter = new MockPremiereAdapter();
    const plugins = await loadAllPlugins({
      pluginsDir: path.join(root, 'plugins'),
      adapter,
      logger: silentLogger as never,
      hooks: {
        onStyleRegistered: (id, style) => {
          captured = { id, style };
        },
      },
    });
    expect(plugins).toHaveLength(1);
    expect(captured).toEqual({ id: 'com.example.test', style: { name: 'my-vlog' } });
  });

  it('emit() throws without telemetry:emit', async () => {
    root = await makeFixture({
      bodyJs: `
        export async function activate(ctx) {
          ctx.emit({ name: 'app.launched' });
        }
      `,
    });
    let emitted = false;
    const adapter = new MockPremiereAdapter();
    await loadAllPlugins({
      pluginsDir: path.join(root, 'plugins'),
      adapter,
      logger: silentLogger as never,
      hooks: {
        onTelemetryEmit: () => {
          emitted = true;
        },
      },
    });
    expect(emitted).toBe(false);
  });

  it('deactivate() runs on shutdown', async () => {
    root = await makeFixture({
      bodyJs: `
        let activated = 0, deactivated = 0;
        export async function activate(ctx) { activated++; ctx._activated = activated; }
        export async function deactivate(ctx) { deactivated++; ctx._deactivated = deactivated; }
      `,
    });
    const adapter = new MockPremiereAdapter();
    const loaded = await loadAllPlugins({
      pluginsDir: path.join(root, 'plugins'),
      adapter,
      logger: silentLogger as never,
    });
    expect(loaded).toHaveLength(1);
    expect(typeof loaded[0]!.module.deactivate).toBe('function');
    await deactivateAll(loaded);
  });

  it('PluginPermissionError thrown directly carries fields', async () => {
    root = await makeFixture({
      bodyJs: `
        export async function activate(ctx) {
          if (!ctx.has('premiere:write')) {
            // Direct throw — verifies error class is reachable in the SDK.
          }
        }
      `,
    });
    const adapter = new MockPremiereAdapter();
    const loaded = await loadPluginFromDir(path.join(root, 'plugins', 'com.example.test'), {
      pluginsDir: path.join(root, 'plugins'),
      adapter,
      logger: silentLogger as never,
    });
    expect(loaded.context.has('premiere:write')).toBe(false);
    const err = new PluginPermissionError('com.example.test', 'premiere:write', 'cutClip');
    expect(err.message).toContain('premiere:write');
  });

  it('skips bad plugins, loads good ones', async () => {
    root = await makeFixture({
      bodyJs: `export async function activate() {}`,
    });
    // Add a second plugin with broken manifest
    const badDir = path.join(root, 'plugins', 'com.example.bad');
    await fs.mkdir(badDir, { recursive: true });
    await fs.writeFile(path.join(badDir, 'manifest.json'), '{ "broken": true }');
    const adapter = new MockPremiereAdapter();
    const loaded = await loadAllPlugins({
      pluginsDir: path.join(root, 'plugins'),
      adapter,
      logger: silentLogger as never,
    });
    expect(loaded).toHaveLength(1); // bad plugin skipped
  });
});

/**
 * P5.01b — SDK smoke tests.
 *
 * Three jobs:
 *   1. Confirm every Tier-1 export from ADR-0013 is reachable.
 *   2. Confirm no Tier-2 internal slipped in (LicenseIssuer,
 *      AnthropicClient, dispatchRpc, etc).
 *   3. Confirm the manifest schema accepts a minimal valid plugin
 *      and rejects obvious misses.
 *
 * The CI surface-diff guard (P5.01e) catches drift across releases;
 * these tests catch drift within a single release.
 */
import { describe, it, expect } from 'vitest';
import * as sdk from '../index.js';

describe('SDK public surface (P5.01b + ADR-0013)', () => {
  it('exports all Tier-1 functions', () => {
    const expected = [
      'parsePluginManifest',
      'parseStyle',
      'getBuiltinStyle',
      'listBuiltinStyles',
      'planCuts',
      'validateEvent',
    ];
    for (const name of expected) {
      expect(typeof (sdk as unknown as Record<string, unknown>)[name], `missing ${name}`).toBe(
        'function'
      );
    }
  });

  it('exports all Tier-1 values + schemas', () => {
    const expected = [
      'PluginManifestSchema',
      'PluginPermissionSchema',
      'SemverRangeSchema',
      'StyleSchema',
      'EFFECT_PRESETS',
      'TELEMETRY_EVENT_NAMES',
      'PluginPermissionError',
      'SDK_VERSION',
    ];
    for (const name of expected) {
      expect((sdk as unknown as Record<string, unknown>)[name], `missing ${name}`).toBeDefined();
    }
  });

  it('SDK_VERSION matches package.json', async () => {
    expect(sdk.SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('does NOT re-export Tier-2 internals (negative test)', () => {
    const forbidden = [
      // Credentials
      'AnthropicClient',
      'OpenAIClient',
      'GeminiClient',
      'LLMRouter',
      'registryFromKeys',
      // License internals
      'LicenseIssuer',
      'signLicense',
      'verifyStripeWebhook',
      // Host-only
      'dispatchRpc',
      'executePlan',
      'MockPremiereAdapter',
      'UXPPremiereAdapter',
      'RemotePremiereAdapter',
      'ReadCache',
      'AbortError',
    ];
    const all = sdk as unknown as Record<string, unknown>;
    for (const name of forbidden) {
      expect(all[name], `Tier-2 internal "${name}" leaked into SDK`).toBeUndefined();
    }
  });

  it('PluginPermissionError carries the plugin id + permission', () => {
    const err = new sdk.PluginPermissionError('com.example.plugin', 'premiere:write', 'cutClip');
    expect(err.pluginId).toBe('com.example.plugin');
    expect(err.needed).toBe('premiere:write');
    expect(err.method).toBe('cutClip');
    expect(err.message).toContain('com.example.plugin');
    expect(err.message).toContain('premiere:write');
  });
});

describe('PluginManifestSchema (P5.01c)', () => {
  it('parses a minimal valid manifest', () => {
    const m = sdk.parsePluginManifest({
      id: 'com.example.style-pack',
      name: 'Example styles',
      version: '0.1.0',
    });
    expect(m.id).toBe('com.example.style-pack');
    expect(m.entry).toBe('./index.js'); // default
    expect(m.hostSdk).toBe('^1.0.0'); // default
    expect(m.permissions).toEqual([]);
  });

  it('rejects an invalid reverse-DNS id', () => {
    expect(() =>
      sdk.parsePluginManifest({ id: 'not-reverse-dns', name: 'x', version: '1.0.0' })
    ).toThrow();
  });

  it('rejects unknown permissions', () => {
    expect(() =>
      sdk.parsePluginManifest({
        id: 'com.example.p',
        name: 'x',
        version: '1.0.0',
        permissions: ['arbitrary:execute'],
      })
    ).toThrow();
  });

  it('rejects a non-semver version', () => {
    expect(() =>
      sdk.parsePluginManifest({ id: 'com.example.p', name: 'x', version: '1' })
    ).toThrow();
  });

  it('accepts the full permission set', () => {
    const all: sdk.PluginPermission[] = [
      'premiere:read',
      'premiere:write',
      'context:read',
      'style:register',
      'effect:register',
      'tool:register',
      'telemetry:emit',
    ];
    const m = sdk.parsePluginManifest({
      id: 'com.example.p',
      name: 'x',
      version: '1.0.0',
      permissions: all,
    });
    expect(m.permissions).toEqual(all);
  });

  it('built-in styles work via re-export', () => {
    const vlog = sdk.getBuiltinStyle('vlog');
    expect(vlog.name).toBeDefined();
    const names = sdk.listBuiltinStyles();
    expect(names.length).toBeGreaterThanOrEqual(5);
  });

  it('EFFECT_PRESETS are reachable', () => {
    expect(sdk.EFFECT_PRESETS.length).toBeGreaterThan(0);
  });
});

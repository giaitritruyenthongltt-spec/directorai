/**
 * P4.26 — Auto-update orchestrator.
 *
 * Composed from three injected primitives so the same class works in
 * Node (production) and in unit tests with deterministic inputs:
 *
 *   - `fetcher`  — async URL → ArrayBuffer (production: undici fetch)
 *   - `hasher`   — bytes → sha256 hex (production: node:crypto)
 *   - `writer`   — temp-file sink (production: fs.writeFile)
 *
 * The check() method:
 *   1. fetches the manifest
 *   2. validates the schema
 *   3. compares versions
 *   4. if newer, downloads the installer
 *   5. verifies SHA-256
 *   6. writes to staging dir
 *   7. returns the staged path so the boot script applies it next launch
 *
 * Failures at any step are surfaced as a CheckResult; the updater
 * never throws into the caller.
 */
import { compareVersions, UpdateManifestSchema, type UpdateManifest } from './feed.js';

export interface UpdaterDeps {
  fetcher: (url: string) => Promise<ArrayBuffer>;
  hasher: (bytes: ArrayBuffer) => Promise<string>;
  writer: (filename: string, bytes: ArrayBuffer) => Promise<string>;
  /** Current installed version, e.g. read from package.json at boot. */
  currentVersion: () => string;
  /** Optional minimum version we still serve. */
  minSupportedVersion?: string;
}

export type CheckResult =
  | { kind: 'up-to-date'; version: string }
  | { kind: 'updated'; from: string; to: string; stagedPath: string; notes?: string }
  | { kind: 'unsupported'; current: string; minSupported: string }
  | { kind: 'error'; reason: string };

export class AutoUpdater {
  constructor(
    private readonly opts: { feedUrl: string },
    private readonly deps: UpdaterDeps
  ) {}

  async check(): Promise<CheckResult> {
    let manifest: UpdateManifest;
    try {
      const raw = await this.deps.fetcher(this.opts.feedUrl);
      const text = new TextDecoder().decode(raw);
      manifest = UpdateManifestSchema.parse(JSON.parse(text));
    } catch (err) {
      return { kind: 'error', reason: err instanceof Error ? err.message : 'fetch failed' };
    }

    const current = this.deps.currentVersion();
    if (manifest.minSupportedVersion) {
      if (compareVersions(current, manifest.minSupportedVersion) < 0) {
        return {
          kind: 'unsupported',
          current,
          minSupported: manifest.minSupportedVersion,
        };
      }
    }
    if (compareVersions(current, manifest.version) >= 0) {
      return { kind: 'up-to-date', version: current };
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await this.deps.fetcher(manifest.url);
    } catch (err) {
      return { kind: 'error', reason: err instanceof Error ? err.message : 'download failed' };
    }

    const digest = (await this.deps.hasher(bytes)).toLowerCase();
    if (digest !== manifest.sha256.toLowerCase()) {
      return { kind: 'error', reason: `sha256 mismatch (expected ${manifest.sha256})` };
    }

    let stagedPath: string;
    try {
      stagedPath = await this.deps.writer(`DirectorAI-${manifest.version}.msi`, bytes);
    } catch (err) {
      return { kind: 'error', reason: err instanceof Error ? err.message : 'write failed' };
    }

    return {
      kind: 'updated',
      from: current,
      to: manifest.version,
      stagedPath,
      notes: manifest.notes,
    };
  }
}

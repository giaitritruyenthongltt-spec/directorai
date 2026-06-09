/**
 * P5.02e — Pack installer.
 *
 * Given a Pack record + a writable directory, downloads the bundle,
 * verifies the SHA-256, unzips into the user's style library
 * directory. Composed from injected primitives so the installer is
 * fully unit-testable without network or filesystem.
 *
 * Flow (pure on input):
 *   1. fetcher(pack.bundleUrl) → ArrayBuffer
 *   2. hasher(bytes) === pack.bundleSha256 (case-insensitive)
 *   3. unzipper(bytes, targetDir) writes individual .style files
 *   4. return InstallResult { installedFiles: [...] }
 *
 * Production wires fetcher=undici, hasher=node:crypto,
 * unzipper=yauzl. Tests provide stubs.
 */
import type { Pack } from './schema.js';

export interface InstallerDeps {
  fetcher: (url: string) => Promise<ArrayBuffer>;
  hasher: (bytes: ArrayBuffer) => Promise<string>;
  unzipper: (bytes: ArrayBuffer, targetDir: string) => Promise<readonly string[]>;
}

export type InstallResult =
  | { kind: 'installed'; pack: Pack; installedFiles: readonly string[] }
  | { kind: 'sha-mismatch'; pack: Pack; expected: string; actual: string }
  | { kind: 'error'; pack: Pack; reason: string };

export async function installPack(
  pack: Pack,
  targetDir: string,
  deps: InstallerDeps
): Promise<InstallResult> {
  let bytes: ArrayBuffer;
  try {
    bytes = await deps.fetcher(pack.bundleUrl);
  } catch (err) {
    return {
      kind: 'error',
      pack,
      reason: err instanceof Error ? err.message : 'fetch failed',
    };
  }

  const actual = (await deps.hasher(bytes)).toLowerCase();
  if (actual !== pack.bundleSha256.toLowerCase()) {
    return { kind: 'sha-mismatch', pack, expected: pack.bundleSha256, actual };
  }

  let installedFiles: readonly string[];
  try {
    installedFiles = await deps.unzipper(bytes, targetDir);
  } catch (err) {
    return {
      kind: 'error',
      pack,
      reason: err instanceof Error ? err.message : 'unzip failed',
    };
  }

  return { kind: 'installed', pack, installedFiles };
}

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { AutoUpdater, compareVersions, type UpdaterDeps } from '../index.js';

const sha = (b: ArrayBuffer): string => createHash('sha256').update(Buffer.from(b)).digest('hex');

function makeDeps(opts: {
  feed: object;
  msiBytes: ArrayBuffer;
  current: string;
  minSupported?: string;
}): UpdaterDeps {
  const encoder = new TextEncoder();
  const feedBuf = encoder.encode(JSON.stringify(opts.feed)).buffer as ArrayBuffer;
  return {
    fetcher: async (url) => (url.endsWith('.json') ? feedBuf : opts.msiBytes),
    hasher: async (b) => sha(b),
    writer: async (filename) => `/tmp/${filename}`,
    currentVersion: () => opts.current,
    minSupportedVersion: opts.minSupported,
  };
}

describe('compareVersions', () => {
  it('orders numerically by parts', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
  });

  it('treats missing parts as 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1', '1.0.1')).toBe(-1);
  });

  it('strips pre-release tags', () => {
    expect(compareVersions('1.2.3-beta', '1.2.3')).toBe(0);
  });
});

describe('AutoUpdater (P4.26)', () => {
  const msiBytes = new TextEncoder().encode('MSI-CONTENT').buffer as ArrayBuffer;
  const expectedHash = sha(msiBytes);

  it('reports up-to-date when current >= feed', async () => {
    const u = new AutoUpdater(
      { feedUrl: 'https://x/stable.json' },
      makeDeps({
        feed: { version: '1.0.0', url: 'https://x/m.msi', sha256: expectedHash },
        msiBytes,
        current: '1.0.0',
      })
    );
    const res = await u.check();
    expect(res.kind).toBe('up-to-date');
  });

  it('downloads + verifies + stages when newer', async () => {
    const u = new AutoUpdater(
      { feedUrl: 'https://x/stable.json' },
      makeDeps({
        feed: {
          version: '1.0.1',
          url: 'https://x/m.msi',
          sha256: expectedHash,
          notes: 'fixed cut',
        },
        msiBytes,
        current: '1.0.0',
      })
    );
    const res = await u.check();
    expect(res.kind).toBe('updated');
    if (res.kind === 'updated') {
      expect(res.from).toBe('1.0.0');
      expect(res.to).toBe('1.0.1');
      expect(res.stagedPath).toContain('DirectorAI-1.0.1.msi');
      expect(res.notes).toBe('fixed cut');
    }
  });

  it('errors on SHA-256 mismatch (no install)', async () => {
    const u = new AutoUpdater(
      { feedUrl: 'https://x/stable.json' },
      makeDeps({
        feed: { version: '1.0.1', url: 'https://x/m.msi', sha256: 'a'.repeat(64) },
        msiBytes,
        current: '1.0.0',
      })
    );
    const res = await u.check();
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.reason).toMatch(/sha256/);
  });

  it('marks unsupported when current < minSupported', async () => {
    const u = new AutoUpdater(
      { feedUrl: 'https://x/stable.json' },
      makeDeps({
        feed: {
          version: '2.0.0',
          url: 'https://x/m.msi',
          sha256: expectedHash,
          minSupportedVersion: '1.0.0',
        },
        msiBytes,
        current: '0.9.0',
      })
    );
    const res = await u.check();
    expect(res.kind).toBe('unsupported');
  });

  it('handles fetcher errors gracefully', async () => {
    const deps: UpdaterDeps = {
      fetcher: async () => {
        throw new Error('network down');
      },
      hasher: async () => '',
      writer: async () => '',
      currentVersion: () => '1.0.0',
    };
    const u = new AutoUpdater({ feedUrl: 'https://x/stable.json' }, deps);
    const res = await u.check();
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.reason).toMatch(/network/);
  });
});

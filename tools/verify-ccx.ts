/**
 * F7 — Verify a built .ccx bundle has the right shape before shipping.
 *
 * Checks:
 *   - File exists at the expected path
 *   - Exactly ONE manifest.json (no dupes)
 *   - manifest.json passes manifestVersion=5 + entrypoints schema
 *   - Required asset files present: index.html, bundle.js, icons/icon23.png
 *   - No *.map files (source maps shouldn't ship)
 *   - Size is in a sane range (50KB-5MB)
 *
 * Exit 0 on success, non-zero on first failure.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yauzl from 'yauzl';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PANEL_MANIFEST = path.join(ROOT, 'apps', 'panel', 'manifest.json');

interface ZipEntry {
  fileName: string;
  uncompressedSize: number;
  content?: Buffer;
}

async function readZip(zipPath: string): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipFile) => {
      if (err || !zipFile) {
        reject(err ?? new Error('zipFile missing'));
        return;
      }
      const entries: ZipEntry[] = [];
      zipFile.readEntry();
      zipFile.on('entry', (e) => {
        // Capture manifest.json content for schema check.
        if (e.fileName === 'manifest.json') {
          zipFile.openReadStream(e, (err2, stream) => {
            if (err2 || !stream) {
              reject(err2 ?? new Error('stream missing'));
              return;
            }
            const chunks: Buffer[] = [];
            stream.on('data', (c) => chunks.push(c as Buffer));
            stream.on('end', () => {
              entries.push({
                fileName: e.fileName,
                uncompressedSize: e.uncompressedSize,
                content: Buffer.concat(chunks),
              });
              zipFile.readEntry();
            });
          });
        } else {
          entries.push({ fileName: e.fileName, uncompressedSize: e.uncompressedSize });
          zipFile.readEntry();
        }
      });
      zipFile.on('end', () => resolve(entries));
      zipFile.on('error', reject);
    });
  });
}

function check(label: string, cond: boolean, detail?: string): void {
  const icon = cond ? '✔' : '✗';
  console.info(`  ${icon} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await fs.readFile(PANEL_MANIFEST, 'utf8')) as {
    version: string;
    manifestVersion: number;
    entrypoints?: unknown[];
  };
  const ccxPath = path.join(ROOT, 'dist', 'installer', `DirectorAI-${manifest.version}.ccx`);
  console.info(`Verifying ${path.relative(ROOT, ccxPath)}…`);

  try {
    await fs.access(ccxPath);
  } catch {
    console.error(`❌ CCX not found at ${ccxPath}. Run "pnpm bundle:ccx" first.`);
    process.exit(1);
  }

  const stat = await fs.stat(ccxPath);
  check(
    `size in 50KB-5MB range`,
    stat.size > 50 * 1024 && stat.size < 5 * 1024 * 1024,
    `${(stat.size / 1024).toFixed(1)} KB`
  );

  const entries = await readZip(ccxPath);
  const names = entries.map((e) => e.fileName);

  // Required entries
  for (const required of ['manifest.json', 'index.html', 'bundle.js', 'icons/icon23.png']) {
    check(`contains ${required}`, names.includes(required));
  }

  // Exactly one manifest.json
  const manifestCount = names.filter((n) => n === 'manifest.json').length;
  check(`exactly one manifest.json`, manifestCount === 1, `found ${manifestCount}`);

  // No source-maps shipped
  const mapFiles = names.filter((n) => n.endsWith('.map'));
  check(`no source maps`, mapFiles.length === 0, `found ${mapFiles.length}`);

  // Manifest content sanity
  const manifestEntry = entries.find((e) => e.fileName === 'manifest.json' && e.content);
  if (manifestEntry?.content) {
    const m = JSON.parse(manifestEntry.content.toString('utf8')) as {
      manifestVersion: number;
      version: string;
      host: { app: string };
      entrypoints?: { type: string }[];
    };
    check(`manifestVersion = 5`, m.manifestVersion === 5);
    check(`host.app = 'premierepro'`, m.host?.app === 'premierepro');
    check(`version matches outer`, m.version === manifest.version, m.version);
    check(
      `≥ 1 panel entrypoint`,
      Array.isArray(m.entrypoints) && m.entrypoints.some((e) => e.type === 'panel')
    );
  }

  if (process.exitCode !== 1) {
    console.info(`\n✅ CCX bundle valid: DirectorAI-${manifest.version}.ccx`);
  } else {
    console.info('\n❌ CCX bundle has issues — see ✗ rows above.');
  }
}

void main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});

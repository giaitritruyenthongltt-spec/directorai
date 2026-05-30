/**
 * P4.22 — UXP CCX bundle script.
 *
 * Adobe's `.ccx` package is a zip with a specific layout:
 *
 *   manifest.json                (at the root)
 *   bundle.js                    (or whatever main points to)
 *   index.html
 *   icons/...
 *
 * We just take everything from `apps/panel/dist/` plus the source
 * `manifest.json` and zip it into `dist/installer/DirectorAI-<version>.ccx`.
 *
 * Adobe code signing happens AFTER this (`tools/sign-ccx.ps1` —
 * P4.23) and requires the holder's UXP signing cert.
 *
 * Usage:
 *   pnpm --filter @directorai/panel build
 *   pnpm bundle:ccx
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { ZipFile } from 'yazl';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PANEL_DIST = path.join(ROOT, 'apps', 'panel', 'dist');
const PANEL_MANIFEST = path.join(ROOT, 'apps', 'panel', 'manifest.json');
const OUT_DIR = path.join(ROOT, 'dist', 'installer');

interface PanelManifest {
  version: string;
  id: string;
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const ent = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of ent) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

async function main(): Promise<void> {
  let manifest: PanelManifest;
  try {
    manifest = JSON.parse(await fs.readFile(PANEL_MANIFEST, 'utf8')) as PanelManifest;
  } catch (err) {
    console.error(`Could not read ${PANEL_MANIFEST}:`, err);
    process.exit(1);
  }

  try {
    await fs.access(PANEL_DIST);
  } catch {
    console.error(
      `Panel dist not found at ${PANEL_DIST}. Run "pnpm --filter @directorai/panel build" first.`
    );
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `DirectorAI-${manifest.version}.ccx`);

  const zip = new ZipFile();
  const distEntries = await walk(PANEL_DIST);
  for (const rel of distEntries) {
    zip.addFile(path.join(PANEL_DIST, rel), rel);
  }
  zip.addFile(PANEL_MANIFEST, 'manifest.json');
  zip.end();

  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(outPath);
    zip.outputStream.pipe(ws);
    ws.on('close', () => resolve());
    ws.on('error', reject);
  });

  const stat = await fs.stat(outPath);
  console.log(
    `CCX bundle written → ${path.relative(ROOT, outPath)} (${(stat.size / 1024).toFixed(1)} KB)`
  );
  console.log('Next step: sign via tools/sign-ccx.ps1 (P4.23).');
}

void main();

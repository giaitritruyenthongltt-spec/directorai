/**
 * P4.32 — Bundle samples/<name>/ into a zip for distribution.
 *
 * Output: dist/installer/samples/<name>.zip
 *
 *   pnpm bundle:sample             → bundles every directory under samples/
 *   pnpm bundle:sample hello-vlog  → bundles a single sample
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZipFile } from 'yazl';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SAMPLES = path.join(ROOT, 'samples');
const OUT = path.join(ROOT, 'dist', 'installer', 'samples');

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

async function bundle(name: string): Promise<void> {
  const src = path.join(SAMPLES, name);
  const stat = await fs.stat(src);
  if (!stat.isDirectory()) {
    console.warn(`skip ${name} (not a directory)`);
    return;
  }
  await fs.mkdir(OUT, { recursive: true });
  const outPath = path.join(OUT, `${name}.zip`);
  const zip = new ZipFile();
  for (const rel of await walk(src)) {
    zip.addFile(path.join(src, rel), `${name}/${rel}`);
  }
  zip.end();
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(outPath);
    zip.outputStream.pipe(ws);
    ws.on('close', () => resolve());
    ws.on('error', reject);
  });
  const sz = (await fs.stat(outPath)).size;
  console.log(`✔ ${name}.zip → ${path.relative(ROOT, outPath)} (${(sz / 1024).toFixed(1)} KB)`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg) {
    await bundle(arg);
    return;
  }
  const ent = await fs.readdir(SAMPLES, { withFileTypes: true });
  for (const e of ent) {
    if (e.isDirectory()) await bundle(e.name);
  }
}

void main();

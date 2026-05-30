/**
 * P4.27 — Docs site build script.
 *
 * Reads docs/, generates one .html per page + a top-level index +
 * a /search-index.json (P4.30). Output lands in apps/docs-site/dist/.
 *
 *   pnpm --filter @directorai/docs-site build
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPages, buildSearchIndex, type Page } from './collect.js';
import { renderIndex, renderPage } from './render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const DOCS_ROOT = path.join(REPO_ROOT, 'docs');
const OUT_DIR = path.join(APP_ROOT, 'dist');

function groupBySection(pages: readonly Page[]): Record<string, Page[]> {
  const out: Record<string, Page[]> = {};
  for (const p of pages) {
    (out[p.section] ??= []).push(p);
  }
  return out;
}

async function writeFile(rel: string, content: string): Promise<void> {
  const full = path.join(OUT_DIR, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

async function main(): Promise<void> {
  console.info(`Building docs from ${path.relative(REPO_ROOT, DOCS_ROOT)} …`);
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const pages = await collectPages(DOCS_ROOT);
  const bySection = groupBySection(pages);

  // 1. Index
  await writeFile('index.html', renderIndex(bySection));

  // 2. One page per markdown
  for (const p of pages) {
    await writeFile(`${p.slug}.html`, renderPage(p, bySection));
  }

  // 3. Search index (P4.30)
  await writeFile('search-index.json', JSON.stringify(buildSearchIndex(pages)));

  console.info(`✔ ${pages.length} pages written to ${path.relative(REPO_ROOT, OUT_DIR)}`);
}

void main();

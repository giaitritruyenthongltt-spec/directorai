/**
 * P4.27 — Docs site dev server. Rebuilds on every request — fine for
 * the docs flow (we're not edit-saving inside the running site).
 *
 *   pnpm --filter @directorai/docs-site dev
 *
 * Default port 7790; override with DOCS_PORT.
 */
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPages, buildSearchIndex } from './collect.js';
import { renderIndex, renderPage } from './render.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');
const DOCS_ROOT = path.join(REPO_ROOT, 'docs');
function groupBySection(pages) {
  const out = {};
  for (const p of pages) (out[p.section] ??= []).push(p);
  return out;
}
async function handle(urlPath) {
  const pages = await collectPages(DOCS_ROOT);
  const bySection = groupBySection(pages);
  if (urlPath === '/' || urlPath === '/index.html') {
    return { status: 200, body: renderIndex(bySection), ct: 'text/html; charset=utf-8' };
  }
  if (urlPath === '/search-index.json') {
    return {
      status: 200,
      body: JSON.stringify(buildSearchIndex(pages)),
      ct: 'application/json; charset=utf-8',
    };
  }
  // /<section>/ → first page in that section
  const sectionMatch = urlPath.match(/^\/(adr|guides|architecture|tutorials|api)\/?$/);
  if (sectionMatch) {
    const section = sectionMatch[1];
    const first = bySection[section]?.[0];
    if (first) {
      return {
        status: 200,
        body: renderPage(first, bySection),
        ct: 'text/html; charset=utf-8',
      };
    }
  }
  // /<section>/<slug>.html
  const pageMatch = urlPath.match(/^\/(.+)\.html$/);
  if (pageMatch) {
    const slug = pageMatch[1];
    const page = pages.find((p) => p.slug === slug);
    if (page) {
      return {
        status: 200,
        body: renderPage(page, bySection),
        ct: 'text/html; charset=utf-8',
      };
    }
  }
  return { status: 404, body: 'Not found', ct: 'text/plain' };
}
async function main() {
  // Touch the docs root so we fail loudly if it's missing
  await fs.access(DOCS_ROOT);
  const port = Number(process.env.DOCS_PORT ?? '7790');
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const out = await handle(url.pathname);
      res.writeHead(out.status, { 'Content-Type': out.ct });
      res.end(out.body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`docs-site error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  server.listen(port, () => {
    console.info(`Docs dev server: http://127.0.0.1:${port}`);
  });
}
void main();
//# sourceMappingURL=dev-server.js.map

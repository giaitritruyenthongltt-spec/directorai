/**
 * P4.27 — HTML rendering for the docs site.
 *
 * One layout function wraps the marked-rendered body in a shell with
 * - top nav (sections)
 * - left sidebar (pages in this section)
 * - search input that lazy-loads /search-index.json (P4.30)
 *
 * No framework — plain HTML + a single <script> for the search box.
 */
import { marked } from 'marked';
import type { Page } from './collect.js';

interface RenderOptions {
  current: Page;
  pagesBySection: Record<string, Page[]>;
}

const SECTION_LABEL: Record<string, string> = {
  guides: 'Guides',
  architecture: 'Architecture',
  adr: 'ADRs',
  tutorials: 'Tutorials',
  root: 'Docs',
  api: 'API',
};

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sectionNav(current: string): string {
  const sections = ['guides', 'tutorials', 'architecture', 'adr', 'api'];
  return sections
    .map((s) => {
      const active = s === current ? ' class="active"' : '';
      const href = s === 'api' ? '/api/' : `/${s}/`;
      return `<a href="${href}"${active}>${SECTION_LABEL[s] ?? s}</a>`;
    })
    .join('');
}

function sidebar(section: string, pages: Page[], currentSlug: string): string {
  if (!pages || pages.length === 0) return '';
  const items = pages
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => {
      const active = p.slug === currentSlug ? ' class="active"' : '';
      return `<li><a href="/${p.slug}.html"${active}>${escape(p.title)}</a></li>`;
    })
    .join('');
  return `<aside class="sidebar"><h4>${SECTION_LABEL[section] ?? section}</h4><ul>${items}</ul></aside>`;
}

const SHELL_CSS = `
  :root { --fg:#1a1a1a; --muted:#666; --bg:#fff; --accent:#4c8bf5; --border:#e5e5e5; --code-bg:#f6f8fa; }
  @media (prefers-color-scheme: dark) {
    :root { --fg:#eee; --muted:#aaa; --bg:#0f0f10; --border:#2a2a2c; --code-bg:#1a1a1c; }
  }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; color:var(--fg); background:var(--bg); }
  header { display:flex; align-items:center; gap:24px; padding:12px 24px; border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--bg); z-index:5; }
  header .brand { font-weight:600; font-size:16px; }
  header nav { display:flex; gap:14px; }
  header nav a { color:var(--muted); text-decoration:none; font-size:14px; }
  header nav a:hover, header nav a.active { color:var(--fg); }
  header .search { margin-left:auto; }
  header input { padding:6px 10px; border:1px solid var(--border); border-radius:4px; background:transparent; color:var(--fg); width:240px; }
  .layout { display:grid; grid-template-columns: 240px 1fr; gap:32px; max-width:1200px; margin:0 auto; padding:24px; }
  .sidebar h4 { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); margin:0 0 8px; }
  .sidebar ul { list-style:none; padding:0; margin:0; }
  .sidebar li a { display:block; padding:4px 8px; border-radius:3px; text-decoration:none; color:var(--fg); font-size:14px; }
  .sidebar li a:hover { background:var(--code-bg); }
  .sidebar li a.active { background:var(--accent); color:white; }
  main { min-width:0; }
  main h1 { margin-top:0; }
  main h2 { margin-top:1.6em; border-bottom:1px solid var(--border); padding-bottom:.3em; }
  main code { background:var(--code-bg); padding:1px 6px; border-radius:3px; font-family: ui-monospace, "Cascadia Mono", Menlo, monospace; font-size:13px; }
  main pre { background:var(--code-bg); padding:12px; border-radius:6px; overflow:auto; }
  main pre code { padding:0; background:transparent; }
  main table { border-collapse: collapse; }
  main th, main td { border:1px solid var(--border); padding:6px 12px; text-align:left; }
  main blockquote { border-left:4px solid var(--accent); margin:0; padding:8px 16px; color:var(--muted); background:var(--code-bg); }
  #search-results { position:absolute; right:24px; top:48px; max-width:380px; background:var(--bg); border:1px solid var(--border); border-radius:6px; display:none; max-height:60vh; overflow:auto; }
  #search-results a { display:block; padding:8px 12px; border-bottom:1px solid var(--border); color:var(--fg); text-decoration:none; }
  #search-results a:hover { background:var(--code-bg); }
  #search-results .sec { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  footer { text-align:center; padding:24px; color:var(--muted); font-size:12px; }
`;

const SEARCH_SCRIPT = `
async function loadIndex(){
  if (window.__idx) return window.__idx;
  const r = await fetch('/search-index.json');
  window.__idx = await r.json();
  return window.__idx;
}
function score(q, e){
  q = q.toLowerCase();
  if (e.title.toLowerCase().includes(q)) return 100;
  if (e.body.includes(q)) return 10;
  return 0;
}
async function runSearch(){
  const q = document.getElementById('q').value.trim();
  const out = document.getElementById('search-results');
  if (!q){ out.style.display='none'; return; }
  const idx = await loadIndex();
  const hits = idx
    .map(e => ({...e, s: score(q,e)}))
    .filter(e => e.s > 0)
    .sort((a,b)=>b.s-a.s)
    .slice(0, 10);
  out.innerHTML = hits.length === 0
    ? '<a>No matches</a>'
    : hits.map(h=>'<a href="/' + h.slug + '.html"><div class="sec">' + h.section + '</div>' + h.title + '</a>').join('');
  out.style.display='block';
}
document.addEventListener('click', e => {
  if (e.target && (e.target.id === 'q' || e.target.id === 'search-results' || e.target.closest && e.target.closest('#search-results'))) return;
  const r = document.getElementById('search-results');
  if (r) r.style.display='none';
});
`;

export function renderShell(content: string, opts: RenderOptions): string {
  const pages = opts.pagesBySection[opts.current.section] ?? [];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(opts.current.title)} · DirectorAI Docs</title>
  <style>${SHELL_CSS}</style>
</head>
<body>
<header>
  <div class="brand">DirectorAI Docs</div>
  <nav>${sectionNav(opts.current.section)}</nav>
  <div class="search">
    <input id="q" placeholder="Search…" autocomplete="off" oninput="runSearch()" onfocus="runSearch()">
  </div>
  <div id="search-results"></div>
</header>
<div class="layout">
  ${sidebar(opts.current.section, pages, opts.current.slug)}
  <main>${content}</main>
</div>
<footer>DirectorAI · ${new Date().getFullYear()}</footer>
<script>${SEARCH_SCRIPT}</script>
</body>
</html>`;
}

export function renderMarkdown(md: string): string {
  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(md, { async: false }) as string;
}

export function renderPage(page: Page, pagesBySection: Record<string, Page[]>): string {
  const body = renderMarkdown(page.markdown);
  return renderShell(body, { current: page, pagesBySection });
}

export function renderIndex(pagesBySection: Record<string, Page[]>): string {
  const sections = Object.keys(pagesBySection);
  const blocks = sections
    .map((s) => {
      const list = pagesBySection[s]
        ?.slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((p) => `<li><a href="/${p.slug}.html">${escape(p.title)}</a></li>`)
        .join('');
      return `<section><h2>${SECTION_LABEL[s] ?? s}</h2><ul>${list ?? ''}</ul></section>`;
    })
    .join('');
  const fake: Page = {
    sourcePath: '',
    relPath: 'index',
    section: 'root',
    slug: 'index',
    title: 'DirectorAI Documentation',
    markdown: '',
  };
  return renderShell(
    `<h1>DirectorAI Documentation</h1><p>${escape(
      'AI Editing Copilot for Adobe Premiere Pro.'
    )}</p>${blocks}`,
    { current: fake, pagesBySection }
  );
}

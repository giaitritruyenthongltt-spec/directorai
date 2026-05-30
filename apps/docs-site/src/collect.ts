/**
 * P4.27 — Collect markdown pages from docs/ and build a page tree.
 *
 * The SSG walks four roots:
 *   docs/                  → top-level guides + README
 *   docs/guides/           → user-facing guides
 *   docs/architecture/     → architectural overview
 *   docs/adr/              → P4.28 — every ADR auto-listed
 *
 * Each Markdown file becomes a Page; the section it lives under is
 * derived from the parent directory. The first H1 in the file is the
 * page title (falls back to the filename).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface Page {
  /** Absolute source path. */
  sourcePath: string;
  /** Path under docs/, e.g. "guides/roadmap.md". */
  relPath: string;
  /** "guides" | "architecture" | "adr" | "root" */
  section: string;
  /** Slug used in URLs: "guides/roadmap" or "adr/0006-reliability-layer". */
  slug: string;
  /** First H1, falling back to filename. */
  title: string;
  /** Raw markdown body. */
  markdown: string;
}

const SECTIONS = ['guides', 'architecture', 'adr', 'tutorials'] as const;

function firstH1(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? (m[1] ?? '').trim() : fallback;
}

async function listMd(dir: string): Promise<string[]> {
  try {
    const ent = await fs.readdir(dir, { withFileTypes: true });
    return ent
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .filter((e) => e.name.toLowerCase() !== 'template.md')
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

export async function collectPages(docsRoot: string): Promise<Page[]> {
  const pages: Page[] = [];

  // Root-level pages (e.g. docs/README.md)
  for (const file of await listMd(docsRoot)) {
    const rel = path.relative(docsRoot, file).replace(/\\/g, '/');
    const md = await fs.readFile(file, 'utf8');
    const slug = rel.replace(/\.md$/, '');
    pages.push({
      sourcePath: file,
      relPath: rel,
      section: 'root',
      slug,
      title: firstH1(md, slug),
      markdown: md,
    });
  }

  for (const section of SECTIONS) {
    const dir = path.join(docsRoot, section);
    for (const file of await listMd(dir)) {
      const base = path.basename(file, '.md');
      const md = await fs.readFile(file, 'utf8');
      pages.push({
        sourcePath: file,
        relPath: `${section}/${base}.md`,
        section,
        slug: `${section}/${base}`,
        title: firstH1(md, base),
        markdown: md,
      });
    }
  }

  return pages;
}

export interface SearchEntry {
  slug: string;
  section: string;
  title: string;
  /** Lower-cased body for client-side substring search. */
  body: string;
}

/** Build the flat search index consumed by client-side fuzzy search (P4.30). */
export function buildSearchIndex(pages: readonly Page[]): SearchEntry[] {
  return pages.map((p) => ({
    slug: p.slug,
    section: p.section,
    title: p.title,
    body: p.markdown
      .toLowerCase()
      .replace(/```[\s\S]*?```/g, ' ')
      .slice(0, 4_000),
  }));
}

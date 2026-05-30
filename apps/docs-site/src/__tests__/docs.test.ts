/**
 * P4.27 + P4.28 + P4.30 — docs site unit tests.
 *
 * Covers:
 *  - collectPages discovers root + guides + architecture + adr files
 *  - first H1 becomes the page title; filename is the fallback
 *  - buildSearchIndex captures title + lowercased body
 *  - renderPage produces HTML that includes title, body, and search bar
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectPages, buildSearchIndex } from '../collect.js';
import { renderPage, renderIndex } from '../render.js';

async function makeFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'da-docs-'));
  await fs.writeFile(path.join(root, 'README.md'), '# Welcome\n\nRoot page.');
  await fs.mkdir(path.join(root, 'guides'));
  await fs.writeFile(path.join(root, 'guides', 'roadmap.md'), '# DirectorAI Roadmap\n\nfoo bar');
  await fs.mkdir(path.join(root, 'adr'));
  await fs.writeFile(
    path.join(root, 'adr', '0001-stack.md'),
    '# ADR 0001 Stack\n\nTypeScript and Python.'
  );
  await fs.writeFile(path.join(root, 'adr', 'template.md'), '# Template\n\nignored');
  await fs.mkdir(path.join(root, 'architecture'));
  await fs.writeFile(
    path.join(root, 'architecture', 'overview.md'),
    '# Architecture overview\n\nlayers'
  );
  return root;
}

describe('docs-site collect/render (P4.27/28/30)', () => {
  it('collects pages from all sections and skips template.md', async () => {
    const root = await makeFixture();
    const pages = await collectPages(root);
    const titles = pages.map((p) => p.title).sort();
    expect(titles).toEqual([
      'ADR 0001 Stack',
      'Architecture overview',
      'DirectorAI Roadmap',
      'Welcome',
    ]);
    expect(pages.some((p) => p.slug === 'adr/template')).toBe(false);
  });

  it('falls back to filename when no H1', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'da-docs-'));
    await fs.mkdir(path.join(root, 'guides'));
    await fs.writeFile(path.join(root, 'guides', 'plain.md'), 'no heading');
    const pages = await collectPages(root);
    expect(pages[0]!.title).toBe('plain');
  });

  it('search index strips code blocks and lowercases', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'da-docs-'));
    await fs.mkdir(path.join(root, 'guides'));
    await fs.writeFile(
      path.join(root, 'guides', 'p.md'),
      '# Page\n\nHello WORLD\n\n```ts\nconst x = 1;\n```\n\nKeyword'
    );
    const pages = await collectPages(root);
    const idx = buildSearchIndex(pages);
    expect(idx[0]!.body).toContain('hello world');
    expect(idx[0]!.body).not.toContain('const x = 1');
    expect(idx[0]!.body).toContain('keyword');
  });

  it('renders a page with title, body, and sidebar', async () => {
    const root = await makeFixture();
    const pages = await collectPages(root);
    const bySection: Record<string, typeof pages> = {};
    for (const p of pages) (bySection[p.section] ??= []).push(p);
    const guide = pages.find((p) => p.slug === 'guides/roadmap')!;
    const html = renderPage(guide, bySection);
    expect(html).toContain('<h1>DirectorAI Roadmap</h1>');
    expect(html).toContain('foo bar');
    expect(html).toContain('id="q"'); // search box
    expect(html).toContain('Guides');
  });

  it('renderIndex lists every section', async () => {
    const root = await makeFixture();
    const pages = await collectPages(root);
    const bySection: Record<string, typeof pages> = {};
    for (const p of pages) (bySection[p.section] ??= []).push(p);
    const html = renderIndex(bySection);
    expect(html).toContain('DirectorAI Documentation');
    expect(html).toContain('Guides');
    expect(html).toContain('ADRs');
    expect(html).toContain('Architecture');
  });
});

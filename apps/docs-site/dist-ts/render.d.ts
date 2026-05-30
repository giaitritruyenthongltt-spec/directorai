import type { Page } from './collect.js';
interface RenderOptions {
  current: Page;
  pagesBySection: Record<string, Page[]>;
}
export declare function renderShell(content: string, opts: RenderOptions): string;
export declare function renderMarkdown(md: string): string;
export declare function renderPage(page: Page, pagesBySection: Record<string, Page[]>): string;
export declare function renderIndex(pagesBySection: Record<string, Page[]>): string;
export {};
//# sourceMappingURL=render.d.ts.map

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
export declare function collectPages(docsRoot: string): Promise<Page[]>;
export interface SearchEntry {
  slug: string;
  section: string;
  title: string;
  /** Lower-cased body for client-side substring search. */
  body: string;
}
/** Build the flat search index consumed by client-side fuzzy search (P4.30). */
export declare function buildSearchIndex(pages: readonly Page[]): SearchEntry[];
//# sourceMappingURL=collect.d.ts.map

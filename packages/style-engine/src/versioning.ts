/**
 * Style versioning + import/export (P3.21-P3.23).
 *
 * - StyleVersion: a snapshot of a Style with metadata (parent, message).
 * - StyleHistory: ordered list of versions for one style name.
 * - exportStyleFile / importStyleFile: a tiny serializable bundle that
 *   carries the YAML body + version metadata. Not a zip — we keep it
 *   single-JSON so it can be diffed in git or sent over Slack.
 * - diffStyles: shallow field-by-field diff for human reading.
 */

import type { Style } from './schema.js';
import { parseStyle, serializeStyle } from './parser.js';

export interface StyleVersion {
  readonly versionId: string;
  readonly parentVersionId?: string;
  readonly createdAt: string;
  readonly message: string;
  readonly style: Style;
}

export interface StyleHistory {
  readonly styleName: string;
  readonly versions: readonly StyleVersion[];
  readonly headId?: string;
}

const newVersionId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class StyleVersionStore {
  private readonly histories = new Map<string, StyleHistory>();

  commit(style: Style, message: string): StyleVersion {
    const existing = this.histories.get(style.name);
    const parentVersionId = existing?.headId;
    const v: StyleVersion = {
      versionId: newVersionId(),
      parentVersionId,
      createdAt: new Date().toISOString(),
      message,
      style,
    };
    this.histories.set(style.name, {
      styleName: style.name,
      versions: [...(existing?.versions ?? []), v],
      headId: v.versionId,
    });
    return v;
  }

  getHistory(styleName: string): StyleHistory | undefined {
    return this.histories.get(styleName);
  }

  /** Reset HEAD to a previous version (does not delete newer versions). */
  rollback(styleName: string, toVersionId: string): StyleVersion | null {
    const h = this.histories.get(styleName);
    if (!h) return null;
    const target = h.versions.find((v) => v.versionId === toVersionId);
    if (!target) return null;
    this.histories.set(styleName, { ...h, headId: target.versionId });
    return target;
  }

  head(styleName: string): StyleVersion | undefined {
    const h = this.histories.get(styleName);
    if (!h?.headId) return undefined;
    return h.versions.find((v) => v.versionId === h.headId);
  }
}

// ─── Import / export ───────────────────────────────────────────────────────

export interface StyleFile {
  readonly format: 'directorai.style.v1';
  readonly yaml: string;
  readonly version?: StyleVersion;
  readonly notes?: string;
}

export function exportStyleFile(
  style: Style,
  options: { version?: StyleVersion; notes?: string } = {}
): StyleFile {
  return {
    format: 'directorai.style.v1',
    yaml: serializeStyle(style),
    version: options.version,
    notes: options.notes,
  };
}

export function importStyleFile(file: StyleFile): Style {
  if (file.format !== 'directorai.style.v1') {
    throw new Error(`Unknown style file format: ${file.format}`);
  }
  return parseStyle(file.yaml);
}

// ─── Shallow diff (for UI) ─────────────────────────────────────────────────

export interface StyleFieldDiff {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
}

export function diffStyles(a: Style, b: Style): readonly StyleFieldDiff[] {
  const diffs: StyleFieldDiff[] = [];
  const recurse = (path: string, av: unknown, bv: unknown): void => {
    if (av === bv) return;
    if (
      typeof av === 'object' &&
      av !== null &&
      typeof bv === 'object' &&
      bv !== null &&
      !Array.isArray(av) &&
      !Array.isArray(bv)
    ) {
      const keys = new Set([...Object.keys(av), ...Object.keys(bv)]);
      for (const k of keys) {
        recurse(
          path ? `${path}.${k}` : k,
          (av as Record<string, unknown>)[k],
          (bv as Record<string, unknown>)[k]
        );
      }
    } else if (JSON.stringify(av) !== JSON.stringify(bv)) {
      diffs.push({ path, before: av, after: bv });
    }
  };
  recurse('', a, b);
  return diffs;
}

// ─── A/B compare result ────────────────────────────────────────────────────

export interface ABResult {
  readonly styleA: string;
  readonly styleB: string;
  readonly fieldDiffs: readonly StyleFieldDiff[];
  readonly recommendation?: 'A' | 'B' | 'tie';
}

/** Build a structured A/B compare report for two styles. */
export function compareStylesAB(a: Style, b: Style): ABResult {
  return {
    styleA: a.name,
    styleB: b.name,
    fieldDiffs: diffStyles(a, b),
  };
}

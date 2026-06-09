/**
 * P5.09a — Per-style usage aggregator.
 *
 * Walks a stream of `TelemetryEvent`s and emits per-style stats:
 *
 *   {
 *     "vlog":     { applyCount, dryRunCount, errorRate, meanDurationMs, lastUsedAt },
 *     "techReel": { ... },
 *     ...
 *   }
 *
 * Privacy: the input events carry an `installId` we ignore. The output
 * never carries it — only aggregates per style. The aggregator is
 * pure (no I/O), so the consumer decides where the stream comes from
 * (live telemetry sink, batch import, anonymised export).
 *
 * Used by:
 *   - the marketplace home page (popular styles)
 *   - the recommendations engine (P5.09b) as one of its signals
 *   - per-creator dashboards (post-launch)
 */
import type { TelemetryEvent } from '@directorai/telemetry';

/** Per-style aggregate computed by `aggregateStyleStats`. */
export interface StyleStats {
  /** Number of times `style.applied` fired for this style. */
  readonly applyCount: number;
  /** Number of times `style.dryRun` fired for this style. */
  readonly dryRunCount: number;
  /** errored / total apply, 0–1. */
  readonly errorRate: number;
  /** Mean apply duration in milliseconds (rounded). */
  readonly meanDurationMs: number;
  /** Epoch ms of the most recent event we saw for this style. 0 if none. */
  readonly lastUsedAt: number;
  /** Number of distinct installs that applied this style. */
  readonly uniqueInstalls: number;
  /** Number of times the Learner patched this style (style.learner.patched). */
  readonly learnerPatchCount: number;
}

interface StyleAccum {
  applyCount: number;
  dryRunCount: number;
  totalDurationMs: number;
  errorCount: number;
  lastUsedAt: number;
  installSet: Set<string>;
  learnerPatchCount: number;
}

function emptyAccum(): StyleAccum {
  return {
    applyCount: 0,
    dryRunCount: 0,
    totalDurationMs: 0,
    errorCount: 0,
    lastUsedAt: 0,
    installSet: new Set(),
    learnerPatchCount: 0,
  };
}

/**
 * Aggregate a (possibly very long) sequence of telemetry events into
 * per-style stats. O(n) over events, O(s) memory where s = distinct
 * styles seen. Safe to pipe a stream through if needed — the
 * function is pure on its input.
 */
export function aggregateStyleStats(events: Iterable<TelemetryEvent>): Map<string, StyleStats> {
  const accum = new Map<string, StyleAccum>();

  for (const evt of events) {
    const name = evt.name;
    if (name !== 'style.applied' && name !== 'style.dryRun' && name !== 'style.learner.patched') {
      continue;
    }
    const styleName = (evt as { style: string }).style;
    if (!styleName || typeof styleName !== 'string') continue;

    let entry = accum.get(styleName);
    if (!entry) {
      entry = emptyAccum();
      accum.set(styleName, entry);
    }

    const ts = Date.parse(evt.ts);
    if (!Number.isNaN(ts) && ts > entry.lastUsedAt) entry.lastUsedAt = ts;
    if (evt.installId) entry.installSet.add(evt.installId);

    if (name === 'style.applied') {
      const e = evt as Extract<TelemetryEvent, { name: 'style.applied' }>;
      entry.applyCount++;
      entry.totalDurationMs += e.durationMs;
      if (e.stepsError > 0) entry.errorCount++;
    } else if (name === 'style.dryRun') {
      entry.dryRunCount++;
    } else {
      entry.learnerPatchCount++;
    }
  }

  const out = new Map<string, StyleStats>();
  for (const [styleName, e] of accum) {
    out.set(styleName, {
      applyCount: e.applyCount,
      dryRunCount: e.dryRunCount,
      errorRate: e.applyCount === 0 ? 0 : e.errorCount / e.applyCount,
      meanDurationMs: e.applyCount === 0 ? 0 : Math.round(e.totalDurationMs / e.applyCount),
      lastUsedAt: e.lastUsedAt,
      uniqueInstalls: e.installSet.size,
      learnerPatchCount: e.learnerPatchCount,
    });
  }
  return out;
}

/** Convenience: return the top-N styles by applyCount, ties broken by uniqueInstalls. */
export function topStyles(
  stats: Map<string, StyleStats>,
  n = 10
): { name: string; stats: StyleStats }[] {
  return Array.from(stats.entries())
    .map(([name, s]) => ({ name, stats: s }))
    .sort((a, b) => {
      if (b.stats.applyCount !== a.stats.applyCount) {
        return b.stats.applyCount - a.stats.applyCount;
      }
      return b.stats.uniqueInstalls - a.stats.uniqueInstalls;
    })
    .slice(0, n);
}

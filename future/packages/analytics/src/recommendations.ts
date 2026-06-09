/**
 * P5.09b — Style recommendations.
 *
 * Two algorithms, exposed side-by-side so the marketplace can pick:
 *
 *  1. **Jaccard similarity** — "users who applied A also applied B".
 *     Compute per-install style sets; score each style pair by
 *     |A ∩ B| / |A ∪ B|. Cheap, no training, intuitive.
 *  2. **Co-occurrence frequency** — "how often does B follow A in a
 *     session". Useful when we want sequence-aware suggestions.
 *
 * Both take the raw event stream and return ranked recommendations
 * per source style. Privacy: the install ids only flow through the
 * intermediate matrix; the output never carries them.
 *
 * The marketplace UI (P5.02c) will call:
 *
 *   const recs = recommendBySimilarity(events, 'vlog', 5);
 *   // → [{ style: 'tech-reel', score: 0.42 }, { style: 'podcast', score: 0.18 }, ...]
 */
import type { TelemetryEvent } from '@directorai/telemetry';

/** Result row from a recommendation query. */
export interface Recommendation {
  readonly style: string;
  readonly score: number;
}

interface InstallStyleSets {
  /** installId → set of style names that install has applied at least once. */
  readonly perInstall: Map<string, Set<string>>;
  /** style → set of installs that applied it. */
  readonly perStyle: Map<string, Set<string>>;
}

function buildInstallStyleSets(events: Iterable<TelemetryEvent>): InstallStyleSets {
  const perInstall = new Map<string, Set<string>>();
  const perStyle = new Map<string, Set<string>>();
  for (const evt of events) {
    if (evt.name !== 'style.applied') continue;
    const installId = evt.installId;
    const styleName = (evt as { style: string }).style;
    if (!installId || !styleName) continue;
    let i = perInstall.get(installId);
    if (!i) {
      i = new Set();
      perInstall.set(installId, i);
    }
    i.add(styleName);
    let s = perStyle.get(styleName);
    if (!s) {
      s = new Set();
      perStyle.set(styleName, s);
    }
    s.add(installId);
  }
  return { perInstall, perStyle };
}

function intersection<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/**
 * Recommend styles similar to `source` based on which installs
 * applied which styles. Returns top-N (default 5) by Jaccard score.
 *
 * Self-recommendations are filtered out. If the source style has no
 * data, returns an empty array.
 */
export function recommendBySimilarity(
  events: Iterable<TelemetryEvent>,
  source: string,
  n = 5
): Recommendation[] {
  const sets = buildInstallStyleSets(events);
  const sourceInstalls = sets.perStyle.get(source);
  if (!sourceInstalls || sourceInstalls.size === 0) return [];

  const scores: Recommendation[] = [];
  for (const [otherStyle, otherInstalls] of sets.perStyle) {
    if (otherStyle === source) continue;
    const inter = intersection(sourceInstalls, otherInstalls);
    if (inter === 0) continue;
    const union = sourceInstalls.size + otherInstalls.size - inter;
    scores.push({ style: otherStyle, score: inter / union });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, n);
}

/**
 * Recommend by raw co-occurrence: how many distinct installs used
 * BOTH styles. Less normalised than Jaccard but useful when the
 * marketplace wants "popular alongside" rather than "similar taste".
 */
export function recommendByCooccurrence(
  events: Iterable<TelemetryEvent>,
  source: string,
  n = 5
): Recommendation[] {
  const sets = buildInstallStyleSets(events);
  const sourceInstalls = sets.perStyle.get(source);
  if (!sourceInstalls || sourceInstalls.size === 0) return [];

  const scores: Recommendation[] = [];
  for (const [otherStyle, otherInstalls] of sets.perStyle) {
    if (otherStyle === source) continue;
    const inter = intersection(sourceInstalls, otherInstalls);
    if (inter === 0) continue;
    scores.push({ style: otherStyle, score: inter });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, n);
}

/**
 * P4.15 — Read-method cache.
 *
 * Premiere's UXP API has latency on the order of 5–100ms per call.
 * Most operators (LLM agent loops in particular) fetch the same
 * project metadata or sequence info multiple times in a row. A small
 * TTL cache fronts the adapter for purely read methods.
 *
 * Mutating methods bypass the cache AND invalidate matching entries
 * (`project.get` is invalidated by `media.import`, etc).
 */

const DEFAULT_TTL_MS = 1_500;
const DEFAULT_MAX_ENTRIES = 256;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class ReadCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES
  ) {}

  keyFor(method: string, params: unknown): string {
    return `${method}::${params === undefined ? '' : JSON.stringify(params)}`;
  }

  async getOrCompute<T>(method: string, params: unknown, compute: () => Promise<T>): Promise<T> {
    const key = this.keyFor(method, params);
    const now = Date.now();
    const cached = this.store.get(key);
    if (cached && cached.expiresAt > now) {
      // Touch the entry — re-insert moves it to the back for LRU eviction
      this.store.delete(key);
      this.store.set(key, cached);
      this.hits++;
      return cached.value as T;
    }
    this.misses++;
    const value = await compute();
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
    // P4.16 — bound the map; evict oldest insertion (LRU since touched
    // entries are re-inserted on hit).
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (!oldestKey) break;
      this.store.delete(oldestKey);
    }
    return value;
  }

  /** Drop entries whose method matches one of the prefixes. */
  invalidate(prefixes: readonly string[]): void {
    if (prefixes.length === 0) return;
    for (const key of [...this.store.keys()]) {
      const method = key.split('::', 1)[0]!;
      if (prefixes.some((p) => method === p || method.startsWith(`${p}.`))) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hits, misses: this.misses, size: this.store.size };
  }
}

/**
 * The set of RPC methods whose results are safe to cache. Anything not
 * in this list bypasses the cache so reads of mutated state are always
 * fresh.
 */
export const CACHEABLE_METHODS: ReadonlySet<string> = new Set([
  'project.get',
  'project.listSequences',
  'project.getActiveSequence',
  'timeline.listClips',
  'timeline.getClip',
  'marker.list',
  'tracks.list',
  'transition.list',
]);

/**
 * Mutating methods, by group. After any of these runs the cache must
 * drop matching read entries to avoid serving stale data.
 */
export const INVALIDATIONS: Record<string, readonly string[]> = {
  'project.setActiveSequence': ['project'],
  'timeline.cutClip': ['timeline', 'project.getActiveSequence'],
  'timeline.trimClip': ['timeline', 'project.getActiveSequence'],
  'timeline.moveClip': ['timeline', 'project.getActiveSequence'],
  'timeline.deleteClip': ['timeline', 'project.getActiveSequence'],
  'timeline.renameClip': ['timeline'],
  'timeline.setClipInOut': ['timeline', 'project.getActiveSequence'],
  'effect.apply': ['timeline'],
  'effect.remove': ['timeline'],
  'media.import': ['project', 'timeline'],
  'marker.add': ['marker'],
  'marker.delete': ['marker'],
  'color.applyPreset': ['timeline'],
  'color.setParams': ['timeline'],
  'audio.setGain': ['timeline'],
  'audio.addFade': ['timeline'],
  'audio.muteTrack': ['tracks'],
  'text.addOverlay': ['timeline'],
  'transition.apply': ['timeline'],
  'keyframe.add': ['timeline'],
};

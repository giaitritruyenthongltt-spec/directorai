/**
 * P4.16 — ReadCache must not grow without bound when callers vary the
 * params. The eviction keeps the map at <= maxEntries; soak test
 * verifies both the cap and LRU behaviour.
 */
import { describe, it, expect } from 'vitest';
import { ReadCache } from '../cache.js';

describe('P4.16 ReadCache memory bound', () => {
  it('stays at or below maxEntries under arbitrary param variation', async () => {
    const cache = new ReadCache(60_000, 64);
    for (let i = 0; i < 10_000; i++) {
      await cache.getOrCompute('timeline.listClips', { sequenceId: `seq-${i}` }, async () => i);
    }
    expect(cache.stats.size).toBeLessThanOrEqual(64);
  });

  it('LRU eviction — recently-touched entries survive', async () => {
    const cache = new ReadCache(60_000, 4);
    // Insert 4 entries
    for (const k of ['a', 'b', 'c', 'd']) {
      await cache.getOrCompute('m', { k }, async () => k);
    }
    // Touch "a" so it becomes most-recent
    await cache.getOrCompute('m', { k: 'a' }, async () => 'a');
    // Insert two more — "b" and "c" should fall off, "a" + "d" + the new
    // ones survive.
    await cache.getOrCompute('m', { k: 'e' }, async () => 'e');
    await cache.getOrCompute('m', { k: 'f' }, async () => 'f');

    expect(cache.stats.size).toBe(4);

    // Hits expected:
    const hitsBefore = cache.stats.hits;
    await cache.getOrCompute('m', { k: 'a' }, async () => 'a');
    await cache.getOrCompute('m', { k: 'd' }, async () => 'd');
    expect(cache.stats.hits).toBe(hitsBefore + 2);
  });
});

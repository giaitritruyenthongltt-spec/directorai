import { describe, it, expect } from 'vitest';
import { MockPremiereAdapter } from '../mock.js';
import { dispatchRpc } from '../dispatcher.js';
import { ReadCache } from '../cache.js';

describe('P4.15 ReadCache', () => {
  it('cache hit returns memoised value without re-calling adapter', async () => {
    const adapter = new MockPremiereAdapter();
    const cache = new ReadCache(10_000);
    const a = await dispatchRpc('project.get', {}, adapter, { cache });
    const b = await dispatchRpc('project.get', {}, adapter, { cache });
    expect(a).toEqual(b);
    expect(cache.stats.hits).toBe(1);
    expect(cache.stats.misses).toBe(1);
  });

  it('expires after ttl', async () => {
    const adapter = new MockPremiereAdapter();
    const cache = new ReadCache(1);
    await dispatchRpc('project.get', {}, adapter, { cache });
    await new Promise((r) => setTimeout(r, 10));
    await dispatchRpc('project.get', {}, adapter, { cache });
    expect(cache.stats.misses).toBe(2);
  });

  it('mutating method invalidates matching read entries', async () => {
    const adapter = new MockPremiereAdapter();
    const cache = new ReadCache(10_000);
    await dispatchRpc('project.get', {}, adapter, { cache });
    expect(cache.stats.size).toBeGreaterThan(0);
    await dispatchRpc('media.import', { path: 'C:\\x.mp4' }, adapter, { cache });
    // After media.import, project.* + timeline.* entries should be gone.
    const hitsBefore = cache.stats.hits;
    await dispatchRpc('project.get', {}, adapter, { cache });
    expect(cache.stats.hits).toBe(hitsBefore); // not a hit — it was invalidated
    expect(cache.stats.misses).toBeGreaterThan(1);
  });

  it('non-cacheable methods bypass the cache entirely', async () => {
    const adapter = new MockPremiereAdapter();
    const cache = new ReadCache(10_000);
    await dispatchRpc('undo.begin', { label: 'x' }, adapter, { cache });
    await dispatchRpc('undo.end', {}, adapter, { cache });
    expect(cache.stats.size).toBe(0);
  });

  it('1000 sequential project.get calls hit cache and finish quickly', async () => {
    const adapter = new MockPremiereAdapter();
    const cache = new ReadCache(60_000);
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      await dispatchRpc('project.get', {}, adapter, { cache });
    }
    const elapsed = Date.now() - start;
    // p95 < 500ms is the P4.15 budget; 1000 cached hits should run in
    // tens of ms, well under any sensible threshold.
    expect(elapsed).toBeLessThan(500);
    expect(cache.stats.hits).toBe(999);
    expect(cache.stats.misses).toBe(1);
  });
});

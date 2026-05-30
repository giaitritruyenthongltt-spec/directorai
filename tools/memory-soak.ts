/**
 * P4.16 — Memory soak.
 *
 * Drives the server's dispatch path through 60s of mixed read+write
 * traffic and prints heap usage at 10s intervals. Not part of CI —
 * use this as a manual probe before each release.
 *
 *   pnpm tsx tools/memory-soak.ts
 *
 * Pass criterion: rssMb stable; growth < 50 MB across the run.
 */
import { performance } from 'node:perf_hooks';
import {
  MockPremiereAdapter,
  dispatchRpc,
  ReadCache,
} from '../packages/premiere-adapter/src/index.js';

const DURATION_MS = 60_000;
const REPORT_MS = 10_000;

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function main(): Promise<void> {
  const adapter = new MockPremiereAdapter();
  const cache = new ReadCache(1_000, 128);
  const start = performance.now();
  let lastReport = start;
  let ops = 0;

  console.log('Soak start —', new Date().toISOString());

  while (performance.now() - start < DURATION_MS) {
    await dispatchRpc('project.get', {}, adapter, { cache });
    if (ops % 7 === 0) {
      await dispatchRpc('project.listSequences', {}, adapter, { cache });
    }
    if (ops % 11 === 0) {
      await dispatchRpc('media.import', { path: `C:\\soak\\${ops}.mp4` }, adapter, { cache });
    }
    ops++;

    const now = performance.now();
    if (now - lastReport > REPORT_MS) {
      lastReport = now;
      if (global.gc) global.gc();
      const m = process.memoryUsage();
      console.log(
        `[${((now - start) / 1000).toFixed(0)}s]`,
        `ops=${ops}`,
        `rss=${mb(m.rss)}`,
        `heap=${mb(m.heapUsed)}/${mb(m.heapTotal)}`,
        `cache=${cache.stats.size}`,
        `hits=${cache.stats.hits}`,
        `misses=${cache.stats.misses}`
      );
    }
  }

  if (global.gc) global.gc();
  const m = process.memoryUsage();
  console.log(
    'Soak end —',
    `ops=${ops}`,
    `rss=${mb(m.rss)}`,
    `heap=${mb(m.heapUsed)}`,
    `cacheSize=${cache.stats.size}`
  );

  if (m.rss > 200 * 1024 * 1024) {
    console.error('FAIL — rss exceeded 200MB budget');
    process.exit(1);
  }
}

void main();

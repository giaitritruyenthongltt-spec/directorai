#!/usr/bin/env node
/**
 * P5.05a — Render worker entry point.
 *
 * Polls the queue backend, invokes the appropriate Python handler
 * (transcribe / scene / vision / beats), records cost, marks done.
 *
 * This is the boot loop; the queue + dispatcher live in
 * @directorai/render-queue. The Python handler is a subprocess that
 * shares a JSON-over-stdio protocol with our DaVinci bridge style
 * (P5.03c) so the wire shape is familiar.
 *
 * Production wiring of QUEUE_URL → Redis/Postgres backend is
 * owner-completed when cloud GPU + budget cap land (Track C C.12).
 */

import { RenderQueue, InMemoryBackend, quoteBillingCents } from '@directorai/render-queue';
import { randomUUID } from 'node:crypto';

const queue = new RenderQueue({
  backend: new InMemoryBackend(), // swap for RedisBackend when QUEUE_URL set
  uuid: randomUUID,
});

console.info('render-worker booting');
console.info('  QUEUE_URL =', process.env.QUEUE_URL ?? '(unset; using in-memory)');
console.info('  MAX_CONCURRENT_JOBS =', process.env.MAX_CONCURRENT_JOBS ?? '1');

let running = true;
process.on('SIGTERM', () => {
  console.info('SIGTERM — shutting down after current job');
  running = false;
});

async function handle(job) {
  const start = Date.now();
  // Production: subprocess into Python sidecar with job.payload + signed URL
  console.info(`processing ${job.kind} id=${job.id}`);
  await new Promise((r) => setTimeout(r, 200)); // stub
  const minutes = (Date.now() - start) / 60_000;
  const cents = quoteBillingCents(minutes, {
    providerCentsPerMin: Number(process.env.PROVIDER_CENTS_PER_MIN ?? 2),
  });
  console.info(`  → done in ${minutes.toFixed(3)}min, billed ${cents}¢`);
  return { costMinutes: minutes };
}

while (running) {
  const result = await queue.runOne(handle);
  if (!result) await new Promise((r) => setTimeout(r, 1000)); // idle backoff
}

console.info('render-worker exited cleanly');

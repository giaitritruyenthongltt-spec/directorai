/**
 * MVP P0-4 smoke — verify effect.apply / transition.apply / color.applyPreset
 * round-trip from server through panel into REAL Premiere.
 *
 * Prerequisites:
 *   - Server running:    pnpm --filter @directorai/server dev
 *   - Panel loaded in Premiere 2026 via UDT (sideloaded plugin)
 *   - A sequence open with at least one video clip on V1
 *
 * Run:
 *   pnpm tsx tools/smoke-effect-apply.ts
 */
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:7778';
const TIMEOUT = 30_000;

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: { message: string };
}

function call<T>(ws: WebSocket, id: number, method: string, params?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${method} timed out`)), TIMEOUT);
    const handler = (raw: WebSocket.RawData): void => {
      const msg = JSON.parse(raw.toString()) as RpcResponse;
      if (msg.id !== id) return;
      ws.off('message', handler);
      clearTimeout(t);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result as T);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}

interface SequenceRef {
  id: string;
  name: string;
}
interface ClipRef {
  id: string;
  name?: string;
  start?: number;
  end?: number;
}

async function tryStep<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ ok: boolean; result?: T; error?: string }> {
  process.stdout.write(`  ${label}… `);
  try {
    const result = await fn();
    console.info('✔');
    return { ok: true, result };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.info(`✗ ${err}`);
    return { ok: false, error: err };
  }
}

async function main(): Promise<void> {
  console.info(`Connecting to ${URL}…`);
  const ws = new WebSocket(URL);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
    setTimeout(() => rej(new Error('connect timeout')), 5000);
  });
  console.info('✔ ws open\n');

  let nextId = 1;
  const summary: { name: string; ok: boolean; error?: string }[] = [];

  // 1. Get active sequence
  console.info('Step 1 — Get active sequence');
  const seqStep = await tryStep('project.getActiveSequence', () =>
    call<SequenceRef>(ws, nextId++, 'project.getActiveSequence', {})
  );
  summary.push({ name: 'project.getActiveSequence', ok: seqStep.ok, error: seqStep.error });
  if (!seqStep.ok || !seqStep.result?.id) {
    console.info('\n❌ No active sequence — open a project + sequence in Premiere first.');
    ws.close();
    process.exit(1);
  }
  const seq = seqStep.result;
  console.info(`  → sequence: ${seq.name} (${seq.id})\n`);

  // 2. List clips on the sequence
  console.info('Step 2 — List clips');
  const clipsStep = await tryStep('timeline.listClips', () =>
    call<ClipRef[]>(ws, nextId++, 'timeline.listClips', { sequenceId: seq.id })
  );
  summary.push({ name: 'timeline.listClips', ok: clipsStep.ok, error: clipsStep.error });
  if (!clipsStep.ok || !clipsStep.result?.length) {
    console.info('\n❌ Sequence has no clips — add at least one clip on V1.');
    ws.close();
    process.exit(1);
  }
  const clips = clipsStep.result;
  const firstClip = clips[0]!;
  console.info(`  → ${clips.length} clips; first: ${firstClip.id} ${firstClip.name ?? ''}\n`);

  // 3. Apply Lumetri Color effect to first clip — schema requires effectMatchName.
  console.info('Step 3 — effect.apply (Lumetri Color)');
  const effectStep = await tryStep('effect.apply Lumetri', () =>
    call(ws, nextId++, 'effect.apply', {
      clipId: firstClip.id,
      effectMatchName: 'AE.ADBE Lumetri',
    })
  );
  summary.push({ name: 'effect.apply (Lumetri)', ok: effectStep.ok, error: effectStep.error });

  // 4. Apply color preset (Lumetri preset by name)
  console.info('\nStep 4 — color.applyPreset');
  const colorStep = await tryStep('color.applyPreset cinematic', () =>
    call(ws, nextId++, 'color.applyPreset', {
      clipId: firstClip.id,
      presetName: 'cinematic',
    })
  );
  summary.push({ name: 'color.applyPreset', ok: colorStep.ok, error: colorStep.error });

  // 5. Apply transition between clips (need ≥ 2 clips)
  if (clips.length >= 2) {
    console.info('\nStep 5 — transition.apply (Cross Dissolve)');
    const secondClip = clips[1]!;
    const transStep = await tryStep('transition.apply', () =>
      call(ws, nextId++, 'transition.apply', {
        clipIdA: firstClip.id,
        clipIdB: secondClip.id,
        matchName: 'AE.ADBE Cross Dissolve',
        durationSec: 1.0,
      })
    );
    summary.push({ name: 'transition.apply', ok: transStep.ok, error: transStep.error });
  } else {
    console.info('\nStep 5 — transition.apply — SKIPPED (need ≥ 2 clips)');
    summary.push({ name: 'transition.apply', ok: true, error: 'skipped: <2 clips' });
  }

  ws.close();

  console.info('\n─── Summary ─────────────────────────────────────');
  for (const r of summary) {
    const icon = r.ok ? '✔' : '✗';
    const detail = r.error ? ` — ${r.error}` : '';
    console.info(`  ${icon} ${r.name}${detail}`);
  }

  const failed = summary.filter((s) => !s.ok && !s.error?.startsWith('skipped'));
  if (failed.length) {
    console.info(`\n❌ FAIL — ${failed.length} step(s) failed`);
    process.exit(1);
  }
  console.info('\n✅ PASS — apply pipeline alive');
}

void main().catch((err) => {
  console.error('❌ FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});

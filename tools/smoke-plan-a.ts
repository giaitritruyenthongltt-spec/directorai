/**
 * D4 — Plan A smoke: cut-only workflow that avoids known-broken APIs.
 *
 * Exercises ONLY the primitives confirmed working in Premiere 26:
 *   1. project.getActiveSequence  (read)
 *   2. timeline.listClips         (read, uses synthetic IDs via clipCache)
 *   3. marker.add                 (cheap mutation, proves write path)
 *   4. timeline.cutClip           (real mutation — splits a clip in 2)
 *   5. timeline.listClips again   (confirms cut took effect — count +1)
 *
 * What this proves:
 *   - Panel-to-Premiere write pipeline alive (not just reads)
 *   - V2 clipCache invalidates correctly after cutClip
 *   - Synthetic-ID round-trip works for write ops
 *
 * What this avoids (per docs/guides/premiere-26-known-issues.md):
 *   - effect.apply / Component.create  (hangs)
 *   - color.applyPreset                (hangs, calls above)
 *   - transition.apply                 (API removed in Premiere 26)
 *
 * Run:
 *   pnpm smoke:plan-a
 */
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:7778';
const TIMEOUT = 90_000;

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
  name: string;
  kind: 'video' | 'audio';
  trackId: string;
  timelineRange: { start: number; end: number };
}

async function tryStep<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ ok: boolean; result?: T; error?: string; ms: number }> {
  const t0 = Date.now();
  process.stdout.write(`  ${label}… `);
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    console.info(`✔ (${(ms / 1000).toFixed(1)}s)`);
    return { ok: true, result, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    console.info(`✗ (${(ms / 1000).toFixed(1)}s) ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, error: e instanceof Error ? e.message : String(e), ms };
  }
}

async function main(): Promise<void> {
  console.info('━━━ DirectorAI Plan A smoke — cut-only workflow ━━━');
  console.info('Avoids Premiere 26 known issues (Component.create, transition.apply)\n');

  const ws = new WebSocket(URL);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
    setTimeout(() => rej(new Error('connect timeout')), 5000);
  });
  console.info('✔ ws open\n');

  let id = 1;
  const t0 = Date.now();

  // 1. Active sequence
  console.info('Step 1 — project.getActiveSequence');
  const seq1 = await tryStep('getActiveSequence', () =>
    call<SequenceRef>(ws, id++, 'project.getActiveSequence', {})
  );
  if (!seq1.ok || !seq1.result) {
    console.info('\n❌ HALT — need active sequence');
    ws.close();
    process.exit(1);
  }
  const seqId = seq1.result.id;
  console.info(`  → ${seq1.result.name} (${seqId})\n`);

  // 2. List clips (initial)
  console.info('Step 2 — timeline.listClips (initial)');
  const list1 = await tryStep('listClips', () =>
    call<ClipRef[]>(ws, id++, 'timeline.listClips', { sequenceId: seqId })
  );
  if (!list1.ok || !list1.result?.length) {
    console.info('\n❌ HALT — sequence empty');
    ws.close();
    process.exit(1);
  }
  const initialCount = list1.result.length;
  // Filter by trackId prefix instead of kind (Premiere 26 mediaType may
  // misreport but trackId-by-iteration is deterministic).
  const videoByTrack = list1.result.filter((c) => c.trackId?.startsWith('video-'));
  const videoByKind = list1.result.filter((c) => c.kind === 'video');
  console.info(
    `  → ${initialCount} total · ${videoByTrack.length} by trackId · ${videoByKind.length} by kind`
  );
  const videoClips = videoByTrack.length > 0 ? videoByTrack : videoByKind;
  console.info('  First 5 video clips:');
  for (const c of videoClips.slice(0, 5)) {
    const dur = c.timelineRange.end - c.timelineRange.start;
    console.info(
      `    [${c.trackId}] "${c.name}" range=[${c.timelineRange.start.toFixed(2)}, ${c.timelineRange.end.toFixed(2)}] dur=${dur.toFixed(2)}s kind=${c.kind}`
    );
  }
  const targetClip = videoClips.find((c) => c.timelineRange.end - c.timelineRange.start > 0.5);
  if (!targetClip) {
    const maxDur = videoClips.length
      ? Math.max(...videoClips.map((c) => c.timelineRange.end - c.timelineRange.start))
      : 0;
    console.info(`\n❌ HALT — no video clip > 0.5s found (max ${maxDur.toFixed(3)}s)`);
    ws.close();
    process.exit(1);
  }
  console.info(
    `\n  Target: "${targetClip.name}" dur=${(targetClip.timelineRange.end - targetClip.timelineRange.start).toFixed(2)}s\n`
  );

  // 3. Add marker — cheap mutation, proves write path
  console.info('Step 3 — marker.add (proof of write path)');
  const markerTime = (targetClip.timelineRange.start + targetClip.timelineRange.end) / 2;
  const markerStep = await tryStep('marker.add', () =>
    call(ws, id++, 'marker.add', {
      sequenceId: seqId,
      time: markerTime,
      name: 'DirectorAI smoke marker',
      comment: 'plan-a verification 2026-06-01',
      color: 'blue',
    })
  );

  // 4. Cut clip at midpoint — real timeline mutation
  console.info('\nStep 4 — timeline.cutClip (real mutation)');
  const cutAt = (targetClip.timelineRange.start + targetClip.timelineRange.end) / 2;
  const cutStep = await tryStep(`cutClip at ${cutAt.toFixed(2)}`, () =>
    call<ClipRef[]>(ws, id++, 'timeline.cutClip', {
      clipId: targetClip.id,
      at: cutAt,
    })
  );

  // 5. List clips again — verify cut effective
  console.info('\nStep 5 — timeline.listClips (verify)');
  const list2 = await tryStep('listClips after cut', () =>
    call<ClipRef[]>(ws, id++, 'timeline.listClips', { sequenceId: seqId })
  );

  ws.close();

  const finalCount = list2.result?.length ?? 0;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.info('\n─── Plan A Summary ──────────────────────────────────');
  console.info(`  initial clips:  ${initialCount}`);
  console.info(`  final clips:    ${finalCount}`);
  console.info(`  delta:          ${finalCount - initialCount} (+1 = cut succeeded)`);
  console.info(`  marker.add:     ${markerStep.ok ? '✔' : '✗'}`);
  console.info(`  cutClip:        ${cutStep.ok ? '✔' : '✗'}`);
  console.info(`  total wall:     ${elapsed}s`);

  const cutWorked = cutStep.ok && finalCount > initialCount;
  if (cutWorked && markerStep.ok) {
    console.info('\n✅ PASS — Plan A workflow (cut + marker) lives in Premiere 26');
    process.exit(0);
  } else {
    console.info('\n❌ FAIL — workflow did not mutate timeline as expected');
    process.exit(1);
  }
}

void main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});

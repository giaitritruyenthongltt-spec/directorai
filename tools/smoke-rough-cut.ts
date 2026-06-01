/**
 * P1-4 — End-to-end auto rough cut smoke test.
 *
 * Exercises the full Workflow 1 pipeline:
 *   1. project.getActiveSequence
 *   2. context.scanClips (rank by quality)
 *   3. context.detectBeats (on supplied audio)
 *   4. timeline.cutOnBeats (cuts top-N clips at each beat)
 *
 * Prerequisites:
 *   - Server running:    pnpm --filter @directorai/server dev
 *   - Sidecar running:   pnpm sidecar:start
 *   - Panel sideloaded in Premiere 2026 with a real project + sequence
 *   - Env: AUDIO_PATH=/path/to/music.wav (defaults to first audio clip)
 *
 * Run:
 *   pnpm smoke:rough-cut [audioPath]
 */
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:7778';
const TIMEOUT = 60_000;
const AUDIO_PATH_ARG = process.argv[2] ?? process.env.AUDIO_PATH ?? '';

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
interface ScanResult {
  count: number;
  ranked: boolean;
  clips: { id: string; name: string; path: string; durationSec: number; quality?: number }[];
}
interface BeatResult {
  tempo_bpm: number;
  beats_sec: number[];
}
interface CutResult {
  cuts: number;
  skipped: number;
  details: { beatSec: number; clipId?: string; ok: boolean; reason?: string }[];
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
  const t0 = Date.now();

  // 1 — active sequence
  console.info('Step 1 — project.getActiveSequence');
  const seq = await call<SequenceRef>(ws, nextId++, 'project.getActiveSequence', {});
  console.info(`  → ${seq.name} (${seq.id})\n`);

  // 2 — scan clips (ranked by quality)
  console.info('Step 2 — context.scanClips (rankByQuality)');
  const scan = await call<ScanResult>(ws, nextId++, 'context.scanClips', {
    sequenceId: seq.id,
    rankByQuality: true,
    topN: 10,
    sampleCount: 3,
  });
  console.info(`  → ${scan.count} clips, ranked=${scan.ranked}, kept top ${scan.clips.length}`);
  for (const c of scan.clips.slice(0, 5)) {
    const q = typeof c.quality === 'number' ? c.quality.toFixed(2) : 'n/a';
    console.info(`    ${q}  ${c.name}  (${c.durationSec.toFixed(1)}s)`);
  }

  // 3 — detect beats
  const audioPath =
    AUDIO_PATH_ARG ||
    scan.clips.find((c) => /\.(wav|mp3|aac|m4a|flac)$/i.test(c.path))?.path ||
    scan.clips[0]?.path;
  if (!audioPath) {
    console.info('\n❌ No audioPath provided and no audio clip in sequence — aborting.');
    ws.close();
    process.exit(1);
  }
  console.info(`\nStep 3 — context.detectBeats — ${audioPath}`);
  const beats = await call<BeatResult>(ws, nextId++, 'context.detectBeats', {
    audioPath,
  });
  console.info(`  → tempo=${beats.tempo_bpm.toFixed(1)}bpm, ${beats.beats_sec.length} beats`);
  console.info(
    `    first 10: ${beats.beats_sec
      .slice(0, 10)
      .map((b) => b.toFixed(2))
      .join(', ')}`
  );

  // 4 — cut on beats (limit to first 8 beats to keep the test bounded)
  const cutBeats = beats.beats_sec.slice(0, 8);
  console.info(`\nStep 4 — timeline.cutOnBeats — applying ${cutBeats.length} cuts`);
  const cut = await call<CutResult>(ws, nextId++, 'timeline.cutOnBeats', {
    sequenceId: seq.id,
    beats: cutBeats,
  });
  console.info(`  → cuts=${cut.cuts}, skipped=${cut.skipped}`);
  for (const d of cut.details.slice(0, 8)) {
    const icon = d.ok ? '✔' : '✗';
    const reason = d.reason ? ` — ${d.reason}` : '';
    console.info(`    ${icon} beat=${d.beatSec.toFixed(2)} clip=${d.clipId ?? '-'}${reason}`);
  }

  ws.close();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.info(`\n✅ PASS — auto rough cut pipeline alive (${elapsed}s)`);
}

void main().catch((err) => {
  console.error('❌ FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * Job test toàn diện — chạy thử MỌI chức năng cốt lõi qua WS server thật
 * (Premiere live + Gemini). Ghi PASS/FAIL + thời gian + chi tiết.
 *
 * AN TOÀN: hàm GHI chỉ chạy tới preview/dry-run — KHÔNG mutate timeline thật.
 * Dùng ít clip cho các call Gemini để tiết kiệm chi phí/thời gian.
 *
 *   node tools/function-smoke.mjs
 */
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:7778';
const ws = new WebSocket(URL);
let nextId = 1;

await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
  setTimeout(() => rej(new Error('connect timeout 5s')), 5000);
});

function call(method, params, timeoutMs = 60000) {
  const id = nextId++;
  return new Promise((res, rej) => {
    const t = setTimeout(() => {
      ws.off('message', h);
      rej(new Error(`timeout ${timeoutMs}ms`));
    }, timeoutMs);
    const h = (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.id !== id) return;
      ws.off('message', h);
      clearTimeout(t);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}

const results = [];
async function test(name, fn, timeoutMs) {
  const t0 = Date.now();
  try {
    const detail = await fn(timeoutMs);
    results.push({ name, ok: true, ms: Date.now() - t0, detail: detail ?? '' });
    console.log(`  ✅ ${name}  (${Date.now() - t0}ms) ${detail ?? ''}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, detail: String(e.message).slice(0, 160) });
    console.log(`  ❌ ${name}  (${Date.now() - t0}ms) — ${String(e.message).slice(0, 160)}`);
  }
}

console.log('=== JOB TEST CHỨC NĂNG (live) ===\n');

// ── 1. Nguồn clip (read) ────────────────────────────────────────────────────
let clipPaths = [];
let seqId;
console.log('[1] Nguồn clip + đường dẫn');
await test('context.activeSequenceClips', async () => {
  const r = await call('context.activeSequenceClips', {});
  seqId = r.sequenceId;
  return `seq="${r.sequenceName}" total=${r.total} withFullPath=${r.withFullPath}`;
});
await test('context.resolveFromProject', async () => {
  const r = await call('context.resolveFromProject', {});
  clipPaths = r.resolved.map((x) => x.fullPath).filter((p) => /\.(mp4|mov|m4v|avi|mkv)$/i.test(p));
  return `mediaIndexed=${r.mediaIndexed} resolved=${r.resolved.length} (video=${clipPaths.length})`;
});

const few = clipPaths.slice(0, 3); // cho Gemini Vision (ít để rẻ)
const some = clipPaths.slice(0, 5); // cho plan
const oneAudio = clipPaths[0];

// ── 2. CV / audio (KHÔNG cần Gemini) ────────────────────────────────────────
console.log('\n[2] CV + audio (không Gemini)');
await test('context.qualityReport (3 clip)', async () => {
  if (!few.length) throw new Error('không có clip path');
  const r = await call('context.qualityReport', { clipPaths: few }, 120000);
  return `rows=${r.rows?.length} suspects=${r.summary?.suspects} clusters=${r.summary?.clusters}`;
}, 120000);
await test('context.planDeadAir (3 clip)', async () => {
  if (!few.length) throw new Error('không có clip path');
  const r = await call('context.planDeadAir', { clipPaths: few }, 120000);
  return `analyzed=${r.clips_understood ?? few.length} trims=${r.total_trims} disables=${r.total_disables} saved=${r.estimated_saved_sec}s`;
}, 120000);
await test('context.detectSilences (1 clip)', async () => {
  if (!oneAudio) throw new Error('không có clip');
  const r = await call('context.detectSilences', { audioPath: oneAudio }, 90000);
  return `silences=${r.silences?.length}`;
}, 90000);
await test('context.detectBeats (1 clip)', async () => {
  if (!oneAudio) throw new Error('không có clip');
  const r = await call('context.detectBeats', { audioPath: oneAudio }, 90000);
  return `beats=${r.beats_sec?.length ?? r.beats?.length} tempo=${r.tempo_bpm}`;
}, 90000);
await test('context.clusterClips (5 clip)', async () => {
  if (some.length < 2) throw new Error('cần >=2 clip');
  const r = await call('context.clusterClips', { clipPaths: some }, 120000);
  return `n_clips=${r.n_clips} clusters=${r.n_clusters} reduction=${r.reduction}`;
}, 120000);
await test('context.listEffects', async () => {
  const r = await call('context.listEffects', {});
  return `effects=${Array.isArray(r) ? r.length : (r.effects?.length ?? '?')}`;
});
await test('module.list', async () => {
  const r = await call('module.list', {});
  return `modules=${r.modules?.length}`;
});

// ── 3. AI Vision pipeline (GEMINI) ──────────────────────────────────────────
console.log('\n[3] AI Vision (Gemini — vừa kích hoạt lại)');
await test('context.understandClip (1 clip)', async () => {
  if (!few[0]) throw new Error('không có clip');
  const r = await call('context.understandClip', { clipPath: few[0] }, 120000);
  return `scene=${r.scene_type ?? r.scene} verdict=${r.quality_verdict ?? r.verdict ?? '?'}`;
}, 120000);
await test('context.buildVideoMap (3 clip)', async () => {
  if (few.length < 2) throw new Error('cần >=2 clip');
  const r = await call('context.buildVideoMap', { clipPaths: few }, 150000);
  const vm = r.video_map ?? r;
  return `segments=${vm.segments?.length} key_moments=${vm.key_moments?.length}`;
}, 150000);

let editPlan;
await test('context.buildEditPlan (5 clip, long-form 3 hồi)', async () => {
  if (some.length < 2) throw new Error('cần >=2 clip');
  const r = await call(
    'context.buildEditPlan',
    {
      clipPaths: some,
      goal: 'Dựng phim Nerf 3 hồi gay cấn, giữ khoảnh khắc đắt, bỏ phần thừa.',
      structure: '3act',
      keepRatio: 0.5,
      pacingProfile: 'cinematic',
      maxVisionClips: 5,
    },
    180000
  );
  editPlan = r.edit_plan;
  return `steps=${editPlan?.steps?.length} chapters=${editPlan?.chapters?.length} rejected=${editPlan?.rejected_unsafe_steps ?? 0}`;
}, 180000);

// ── 4. Tầng an toàn (CHỈ preview/dry-run — KHÔNG ghi thật) ──────────────────
console.log('\n[4] Tầng an toàn (preview/dry-run — KHÔNG mutate timeline)');
await test('safe.previewPlan (editPlan)', async () => {
  if (!editPlan) throw new Error('không có editPlan từ bước trên');
  const r = await call('safe.previewPlan', { editPlan, sequenceId: seqId }, 120000);
  return `total=${r.steps?.length ?? r.total} resolved=${r.resolvedCount ?? '?'} executable=${r.executableCount ?? '?'}`;
}, 120000);
await test('safe.applyPlan DRY-RUN (không ghi)', async () => {
  if (!editPlan) throw new Error('không có editPlan');
  const r = await call(
    'safe.applyPlan',
    { editPlan, sequenceId: seqId, dryRun: true, approved: false },
    120000
  );
  return `dryRun=${r.dryRun} total=${r.total} sẽ-ghi=${r.dryRunCount ?? r.applied} hoãn=${r.deferred}`;
}, 120000);

// ── Tổng kết ────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.ok).length;
console.log(`\n=== KẾT QUẢ: ${pass}/${results.length} PASS ===`);
for (const r of results) {
  if (!r.ok) console.log(`  ❌ ${r.name}: ${r.detail}`);
}
ws.close();
process.exit(0);

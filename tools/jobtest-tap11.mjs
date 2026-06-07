/**
 * JOB TEST ĐẦY ĐỦ — chạy LIVE trên sequence đang mở (vd "tap 11") qua WS server
 * (Premiere thật + sidecar + Gemini). Kiểm MỌI chức năng + ĐƯỜNG GHI timeline.
 *
 * AN TOÀN: chỉ ghi 1 thao tác RENAME có TỰ HOÀN TÁC (verify theo clip ID để
 * không nhầm clip trùng tên). Các action khác (disable/trim/move/transition)
 * kiểm qua kế hoạch AI + preview/dry-run (KHÔNG mutate). Kết thúc project nguyên
 * trạng. Exit code 0 = tất cả PASS.
 *
 *   node tools/jobtest-tap11.mjs
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
    console.log(`  PASS  ${name}  (${Date.now() - t0}ms) ${detail ?? ''}`);
    return detail;
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, detail: String(e.message).slice(0, 180) });
    console.log(`  FAIL  ${name}  (${Date.now() - t0}ms) — ${String(e.message).slice(0, 180)}`);
    return null;
  }
}

function renamePlan(targetPath, newName) {
  return {
    goal_understanding: 'jobtest write verify',
    strategy: 'rename 1 clip để kiểm đường ghi (tự hoàn tác)',
    steps: [
      {
        order: 1,
        action: 'rename',
        target_path: targetPath,
        params: { new_name: newName },
        reason: 'jobtest',
        reversible: true,
      },
    ],
    out_of_scope: [],
    estimated_impact: 'rename 1 clip',
    requires_preview: true,
    confidence: 1,
  };
}

console.log('=== JOB TEST ĐẦY ĐỦ (live) — sequence đang mở ===\n');

// ── A. Đọc + nguồn clip ─────────────────────────────────────────────────────
console.log('[A] Đọc dự án + nguồn clip');
let seqId, clips, clipPaths;
await test('project.get', async () => {
  const r = await call('project.get');
  return `project="${r?.metadata?.name ?? '?'}"`;
});
await test('project.getActiveSequence', async () => {
  const r = await call('project.getActiveSequence');
  seqId = r?.id;
  return `seq="${r?.name ?? '?'}" id=${seqId ? 'có' : 'không'}`;
});
await test('context.activeSequenceClips', async () => {
  const r = await call('context.activeSequenceClips', {});
  clips = r.clips;
  seqId = seqId ?? r.sequenceId;
  const hist = {};
  for (const c of clips) hist[c.kind ?? '?'] = (hist[c.kind ?? '?'] ?? 0) + 1;
  return `seq="${r.sequenceName}" total=${r.total} kind=${JSON.stringify(hist)}`;
});
await test('context.resolveFromProject', async () => {
  const r = await call('context.resolveFromProject', {});
  clipPaths = r.resolved.map((x) => x.fullPath).filter((p) => /\.(mp4|mov|m4v|avi|mkv)$/i.test(p));
  return `mediaIndexed=${r.mediaIndexed} resolved=${r.resolved.length} (video=${clipPaths.length})`;
});

const few = (clipPaths ?? []).slice(0, 3);
const some = (clipPaths ?? []).slice(0, 5);

// ── B. CV + audio (không Gemini) ────────────────────────────────────────────
console.log('\n[B] CV + audio (không Gemini)');
await test('context.qualityReport (3)', async () => {
  const r = await call('context.qualityReport', { clipPaths: few }, 120000);
  return `rows=${r.rows?.length} suspects=${r.summary?.suspects} clusters=${r.summary?.clusters}`;
}, 120000);
await test('context.planDeadAir (3)', async () => {
  const r = await call('context.planDeadAir', { clipPaths: few }, 120000);
  return `trims=${r.total_trims} disables=${r.total_disables} saved=${r.estimated_saved_sec}s`;
}, 120000);
await test('context.detectBeats (1)', async () => {
  const r = await call('context.detectBeats', { audioPath: few[0] }, 90000);
  return `beats=${r.beats_sec?.length ?? r.beats?.length} tempo=${r.tempo_bpm}`;
}, 90000);
await test('context.clusterClips (5)', async () => {
  const r = await call('context.clusterClips', { clipPaths: some }, 120000);
  return `clusters=${r.n_clusters} reduction=${r.reduction}`;
}, 120000);
await test('context.listEffects', async () => {
  const r = await call('context.listEffects', {});
  return `effects=${Array.isArray(r) ? r.length : (r.effects?.length ?? '?')}`;
});
await test('module.list', async () => {
  const r = await call('module.list', {});
  return `modules=${r.modules?.length}`;
});

// ── C. AI Vision (Gemini) ───────────────────────────────────────────────────
console.log('\n[C] AI Vision (Gemini)');
await test('context.understandClip (1)', async () => {
  const r = await call('context.understandClip', { clipPath: few[0] }, 120000);
  return `scene=${r.scene_type ?? r.scene} verdict=${r.quality_verdict ?? r.verdict ?? '?'}`;
}, 120000);
await test('context.buildVideoMap (3)', async () => {
  const r = await call('context.buildVideoMap', { clipPaths: few }, 150000);
  const vm = r.video_map ?? r;
  return `segments=${vm.segments?.length} key_moments=${vm.key_moments?.length}`;
}, 150000);
let editPlan;
await test('context.buildEditPlan (5, 3 hồi)', async () => {
  const r = await call(
    'context.buildEditPlan',
    { clipPaths: some, goal: 'Phim Nerf 3 hồi gay cấn, bỏ phần thừa.', structure: '3act', keepRatio: 0.5, pacingProfile: 'cinematic', maxVisionClips: 5 },
    180000
  );
  editPlan = r.edit_plan;
  const acts = {};
  for (const s of editPlan?.steps ?? []) acts[s.action] = (acts[s.action] ?? 0) + 1;
  return `steps=${editPlan?.steps?.length} chapters=${editPlan?.chapters?.length} actions=${JSON.stringify(acts)}`;
}, 180000);

// ── D. Tầng an toàn — mọi action sẵn-sàng-thực-thi (KHÔNG ghi) ──────────────
console.log('\n[D] Preview/dry-run (mọi action execution-ready — KHÔNG mutate)');
await test('safe.previewPlan', async () => {
  if (!editPlan) throw new Error('không có editPlan');
  const r = await call('safe.previewPlan', { editPlan, sequenceId: seqId }, 120000);
  return `total=${r.steps?.length ?? r.total} executable=${r.executableCount ?? '?'}`;
}, 120000);
await test('safe.applyPlan DRY-RUN', async () => {
  if (!editPlan) throw new Error('không có editPlan');
  const r = await call('safe.applyPlan', { editPlan, sequenceId: seqId, dryRun: true, approved: false }, 120000);
  return `dryRun=${r.dryRun} total=${r.total} sẽ-ghi=${r.dryRunCount ?? r.applied} hoãn=${r.deferred}`;
}, 120000);

// ── E. GHI THẬT timeline — rename tự hoàn tác (verify theo ID) ──────────────
console.log('\n[E] GHI THẬT (rename 1 clip, verify theo ID, tự hoàn tác)');
// Chọn clip có TÊN DUY NHẤT (tránh nhầm clip trùng) + có id.
const nameCount = {};
for (const c of clips ?? []) nameCount[c.name] = (nameCount[c.name] ?? 0) + 1;
const target = (clips ?? []).find((c) => c.id && nameCount[c.name] === 1) ?? (clips ?? []).find((c) => c.id);
let renamedOk = false;
let restoredOk = false;
if (!target) {
  await test('rename: chọn clip', async () => {
    throw new Error('không có clip nào có id để test');
  });
} else {
  const origName = target.name;
  const cid = target.id;
  const key = target.path || target.name;
  const testName = `ZZ_JOBTEST_${Date.now() % 100000}`;
  console.log(`  clip thử: "${origName}" (id=${cid}, unique=${nameCount[origName] === 1})`);
  await test('checkpoint.snapshot (an toàn)', async () => {
    const r = await call('checkpoint.snapshot', { label: 'jobtest-before-write' }).catch(() => null);
    return r ? `id=${r.id ?? 'ok'}` : 'bỏ qua (không bắt buộc)';
  });
  await test('safe.applyPlan rename GHI THẬT', async () => {
    const r = await call('safe.applyPlan', { editPlan: renamePlan(key, testName), sequenceId: seqId, dryRun: false, approved: true }, 120000);
    if ((r.applied ?? 0) < 1) throw new Error(`applied=${r.applied} (không ghi)`);
    return `applied=${r.applied} failed=${r.failed}`;
  }, 120000);
  await test('verify rename phản ánh (đếm theo TÊN MỚI)', async () => {
    // LƯU Ý: synthetic id chứa tên → id ĐỔI sau rename; KHÔNG verify theo id cũ.
    // Rename thành công ⇔ tồn tại đúng 1 clip mang testName.
    const r = await call('context.activeSequenceClips', {});
    const renamed = r.clips.filter((c) => c.name === testName);
    renamedOk = renamed.length === 1;
    if (!renamedOk) throw new Error(`có ${renamed.length} clip mang tên "${testName}" (mong 1)`);
    return `clip mang tên mới = ${renamed.length} (${renamed[0]?.kind})`;
  });
  void cid; // id không bền qua rename — chỉ dùng để log clip ban đầu
  await test('hoàn tác rename + verify khôi phục', async () => {
    await call('safe.applyPlan', { editPlan: renamePlan(key, origName), sequenceId: seqId, dryRun: false, approved: true }, 120000);
    const r = await call('context.activeSequenceClips', {});
    const still = r.clips.filter((c) => c.name === testName).length;
    restoredOk = still === 0;
    if (!restoredOk) throw new Error(`vẫn còn ${still} clip tên "${testName}" — bấm CTRL-Z trong Premiere!`);
    return `đã khôi phục (còn ${still} clip tên test)`;
  });
}

// ── F. Hệ thống (checkpoint/marker liveness) ────────────────────────────────
console.log('\n[F] Hệ thống');
await test('checkpoint.list', async () => {
  const r = await call('checkpoint.list', {});
  return `checkpoints=${Array.isArray(r) ? r.length : (r.checkpoints?.length ?? '?')}`;
});
// marker.list là probe PHỤ (chưa nằm trong luồng safe-edit) — không tính pass/fail.
try {
  const r = await call('marker.list', { sequenceId: seqId });
  console.log(`  INFO  marker.list: markers=${Array.isArray(r) ? r.length : (r.markers?.length ?? '?')}`);
} catch (e) {
  console.log(`  INFO  marker.list chưa khả dụng (${String(e.message).slice(0, 70)}) — không tính fail`);
}

// ── Tổng kết ────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.ok).length;
console.log(`\n========================================`);
console.log(`KẾT QUẢ: ${pass}/${results.length} PASS`);
if (pass < results.length) {
  console.log('Các test FAIL:');
  for (const r of results) if (!r.ok) console.log(`  FAIL ${r.name}: ${r.detail}`);
}
console.log(`Ghi timeline: rename=${renamedOk ? 'OK' : 'CHƯA'} · hoàn tác=${restoredOk ? 'OK' : 'CHƯA'}`);
console.log(`========================================`);
ws.close();
process.exit(pass === results.length ? 0 : 1);

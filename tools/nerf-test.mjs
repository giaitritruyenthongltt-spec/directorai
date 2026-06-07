/**
 * NERF live full-flow test — chạy toàn pipeline thật trên footage Nerf (E:/T11).
 * 1) detectScenesSidecar (adaptive + group + thumbnails)
 * 2) qualityReport (CV chấm điểm clip)
 * 3) buildEditPlan (Gemini → kế hoạch dựng có lý do)
 * 4) recut.batch.process — TOÀN BỘ công thức chống-trùng + reframe YOLO
 */
import WebSocket from 'ws';
import { existsSync, statSync } from 'node:fs';

const CLIPS = ['2', '3', '6', '7', '8'].map((n) => `E:/T11/${n}.mp4`);
const ONE = 'E:/T11/7.mp4';

const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p, timeoutMs = 300000) {
  const i = id++;
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error(`timeout ${m}`)), timeoutMs);
    const h = (d) => {
      let x;
      try {
        x = JSON.parse(d);
      } catch {
        return;
      }
      if (x.id !== i) return;
      ws.off('message', h);
      clearTimeout(to);
      x.error ? rej(new Error(x.error.message)) : res(x.result);
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: i, method: m, params: p }));
  });
}
const ok = (b) => (b ? 'PASS' : 'FAIL');
let pass = 0;
let fail = 0;
const mark = (b) => (b ? pass++ : fail++);

try {
  // 1) Scene detect (adaptive + group + thumbnails)
  console.log('\n=== 1) detectScenesSidecar (adaptive+group+thumbs) trên 8.mp4 ===');
  const sc = await call('recut.detectScenesSidecar', {
    videoPath: 'E:/T11/8.mp4',
    detector: 'adaptive',
    group: true,
    thumbnails: true,
    thumbWidth: 160,
  });
  const nScenes = (sc.scenes || []).length;
  const nGroups = (sc.groups || []).length;
  const hasThumb = (sc.scenes || []).some((s) => typeof s.thumb === 'string' && s.thumb.length > 50);
  console.log(`scenes=${nScenes} groups=${nGroups} thumbs=${hasThumb} detector=${sc.detector}`);
  mark(nScenes > 0 && hasThumb);
  console.log('-> ' + ok(nScenes > 0 && hasThumb));

  // 2) Quality report (CV)
  console.log('\n=== 2) qualityReport trên 5 clip Nerf ===');
  const qr = await call('context.qualityReport', { clipPaths: CLIPS });
  const total = qr.summary?.total ?? 0;
  const rows = (qr.rows || []).length;
  console.log(`summary.total=${total} rows=${rows} (kỳ vọng total=5)`);
  mark(total === 5 && rows === 5);
  console.log('-> ' + ok(total === 5 && rows === 5));

  // 3) buildEditPlan (Gemini)
  console.log('\n=== 3) buildEditPlan (Gemini) — phim Nerf action 60s ===');
  const t0 = Date.now();
  const plan = await call(
    'context.buildEditPlan',
    {
      clipPaths: CLIPS,
      goal: 'Dựng trailer Nerf action 60 giây: mở nhanh, cao trào giữa, kết bằng pha bắn đẹp nhất. Giữ nhịp dồn dập.',
      targetDurationSec: 60,
    },
    600000
  );
  const ep = plan.edit_plan || {};
  const steps = (ep.steps || []).length;
  const chapters = (ep.chapters || []).length;
  console.log(
    `clips_understood=${plan.clips_understood} clips_failed=${plan.clips_failed} ` +
      `steps=${steps} chapters=${chapters} in ${Math.round((Date.now() - t0) / 1000)}s`
  );
  console.log(`strategy: ${(ep.strategy || '').slice(0, 140)}`);
  mark(steps > 0);
  console.log('-> ' + ok(steps > 0));

  // 4) Full anti-dup recut + reframe YOLO
  console.log('\n=== 4) recut.batch.process — TOÀN BỘ công thức + reframe trên 7.mp4 ===');
  const out = ONE.replace(/\.[^.]+$/, '_nerf_full.mp4');
  const rc = await call('recut.batch.process', {
    videoPath: ONE,
    outPath: out,
    recipe: {
      flip: true,
      crop_pct: 6,
      reframe: true,
      speed: 1.05,
      saturation: 1.08,
      contrast: 1.05,
      gamma: 1.02,
      hue_deg: 8,
      grain: 6,
      strip_metadata: true,
      title: 'DirectorAI Nerf Test',
    },
  });
  const fileOk = existsSync(out) && statSync(out).size > 0;
  console.log(`ok=${rc.ok} applied=[${(rc.applied || []).join(', ')}]`);
  console.log(`output=${out} exists=${fileOk} size=${fileOk ? statSync(out).size : 0}`);
  const hasReframe = (rc.applied || []).some((a) => a.startsWith('reframe'));
  mark(rc.ok && fileOk && hasReframe);
  console.log('-> ' + ok(rc.ok && fileOk && hasReframe));

  console.log(`\n===== NERF TEST: ${pass} PASS / ${fail} FAIL =====`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.error('FATAL', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

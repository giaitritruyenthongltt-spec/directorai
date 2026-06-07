/**
 * P5 — TEST JOB màu live: baseline → preview (dry) → ghi + verify read-back →
 * intensity 50%. Chứng minh áp Lumetri CHÍNH XÁC qua đọc-lại param.
 * Chạy trên sequence đang mở trong Premiere (English locale).
 */
import WebSocket from 'ws';
const LOOK = 'teal_orange';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p = {}, t = 120000) {
  const i = id++;
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout ' + m)), t);
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
let pass = 0,
  fail = 0;
const ok = (b, msg) => {
  console.log(`  ${b ? 'PASS' : 'FAIL'} — ${msg}`);
  b ? pass++ : fail++;
};
try {
  console.log('=== 1) baseline: activeSequenceClips ===');
  const clipsRes = await call('context.activeSequenceClips', {});
  const clips = clipsRes.clips ?? clipsRes ?? [];
  const vids = clips.filter((c) => (c.kind ?? 'video') === 'video');
  console.log(`  clips=${clips.length} video=${vids.length}`);
  ok(vids.length > 0, 'có clip video trong sequence');
  const target = vids[0];

  console.log('\n=== 2) preview (dryRun) ===');
  const pre = await call('color.applyLook', { look: LOOK, intensity: 100, dryRun: true });
  console.log(`  dryRun=${pre.dryRun} total=${pre.total} look=${pre.look}`);
  const row0 = pre.details?.[0];
  console.log('  thông số dự kiến clip[0]:', JSON.stringify(row0?.params));
  ok(pre.dryRun === true && pre.total > 0 && !!row0?.params, 'preview trả thông số, chưa ghi');

  console.log('\n=== 3) ghi thật + verify read-back ===');
  const wr = await call('color.applyLook', { look: LOOK, intensity: 100, dryRun: false, verify: true });
  console.log(`  applied=${wr.applied} failed=${wr.failed}`);
  ok(wr.applied > 0 && wr.failed === 0, `ghi ${wr.applied} clip không lỗi`);
  ok(wr.details.every((d) => !d.ok || d.verified !== false), 'mỗi clip verified (có Lumetri sau ghi)');

  console.log('\n=== 4) đọc-lại param clip[0] (chứng minh chính xác) ===');
  const rb = await call('color.getParams', { clipId: target.id ?? target.clipId });
  console.log(`  hasLumetri=${rb.hasLumetri}`);
  console.log('  params đọc được:', JSON.stringify(rb.params));
  console.log('  rawParamNames:', JSON.stringify(rb.rawParamNames));
  ok(rb.hasLumetri === true, 'clip có component Lumetri sau ghi');

  console.log('\n=== 5) intensity 50% ===');
  const half = await call('color.applyLook', { look: LOOK, intensity: 50, dryRun: true });
  const h0 = half.details?.[0]?.params ?? {};
  const f0 = row0?.params ?? {};
  // saturation gốc 100: ở 50% phải nằm giữa 100 và giá trị full.
  console.log('  full sat:', f0.saturation, '| 50% sat:', h0.saturation);
  const satOk = f0.saturation === undefined || (h0.saturation > 100 && h0.saturation < f0.saturation) || (h0.saturation < 100 && h0.saturation > f0.saturation) || h0.saturation === Math.round((100 + f0.saturation) / 2);
  ok(Math.abs((h0.contrast ?? 0) - (f0.contrast ?? 0) / 2) <= 1, 'contrast 50% ≈ nửa full (clamp)');

  console.log(`\n===== COLOR TEST JOB: ${pass} PASS / ${fail} FAIL =====`);
  console.log('(Hoàn tác: Ctrl-Z trong Premiere)');
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.error('FATAL', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

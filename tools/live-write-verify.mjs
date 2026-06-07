/**
 * C9 — Verify GHI THẬT lên timeline, TỰ HOÀN TÁC (không để lại thay đổi).
 *
 * Đổi tên 1 clip → kiểm tra đã đổi → đổi LẠI tên cũ. An toàn: kết thúc project
 * y như cũ. Nếu revert lỗi, in cảnh báo để bạn Ctrl-Z (1 undo step).
 *
 *   node tools/live-write-verify.mjs
 */
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:7778');
let nextId = 1;
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
  setTimeout(() => rej(new Error('connect timeout')), 5000);
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

function renamePlan(targetPath, newName) {
  return {
    goal_understanding: 'live write verify',
    strategy: 'đổi tên 1 clip để kiểm tra đường ghi',
    steps: [
      {
        order: 1,
        action: 'rename',
        target_path: targetPath,
        params: { new_name: newName },
        reason: 'C9 live-write test',
        reversible: true,
      },
    ],
    out_of_scope: [],
    estimated_impact: 'đổi tên 1 clip (tự hoàn tác)',
    requires_preview: true,
    confidence: 1,
  };
}

console.log('=== C9 — VERIFY GHI THẬT (tự hoàn tác) ===\n');

const seq = await call('context.activeSequenceClips', {});
console.log(`Sequence: ${seq.sequenceName} (${seq.total} clip)`);
// Chọn clip ĐẦU có path đầy đủ (ổn định để khớp).
const target = seq.clips.find((c) => c.hasFullPath && c.path) ?? seq.clips[0];
if (!target) {
  console.log('❌ Không có clip nào — mở 1 sequence rồi chạy lại.');
  ws.close();
  process.exit(1);
}
const origName = target.name;
const key = target.path || target.name;
const testName = `ZZ_DAI_TEST_${Date.now() % 100000}`;
console.log(`Clip thử: "${origName}"  (key=${key})`);

let restored = false;
try {
  // 1) GHI: đổi tên → testName
  console.log(`\n[1] Ghi: đổi tên → "${testName}" …`);
  const w1 = await call(
    'safe.applyPlan',
    { editPlan: renamePlan(key, testName), sequenceId: seq.sequenceId, dryRun: false, approved: true },
    120000
  );
  console.log(`    applied=${w1.applied} failed=${w1.failed} deferred=${w1.deferred} (dryRun=${w1.dryRun})`);
  if (w1.applied < 1) throw new Error('không ghi được bước rename (applied=0)');

  // 2) KIỂM TRA: rename thành công ⇔ tồn tại đúng 1 clip mang testName.
  // KHÔNG đối chiếu theo path/name CŨ vì có thể trùng nhiều clip (video+audio)
  // → find() trả nhầm clip chưa đổi. (synthetic id cũng đổi theo tên → không
  // dùng id cũ được.)
  console.log('[2] Kiểm tra tên đã đổi …');
  const seq2 = await call('context.activeSequenceClips', {});
  const renamed = seq2.clips.filter((c) => c.name === testName);
  const ok = renamed.length === 1;
  console.log(`    clip mang tên mới = ${renamed.length}  → ${ok ? '✅ ĐÚNG' : '⚠️ chưa thấy đổi'}`);

  // 3) HOÀN TÁC: đổi lại tên cũ
  console.log(`[3] Hoàn tác: đổi lại → "${origName}" …`);
  const w2 = await call(
    'safe.applyPlan',
    {
      editPlan: renamePlan(key, origName),
      sequenceId: seq.sequenceId,
      dryRun: false,
      approved: true,
    },
    120000
  );
  console.log(`    applied=${w2.applied} failed=${w2.failed}`);
  restored = w2.applied >= 1;

  const seq3 = await call('context.activeSequenceClips', {});
  const stillTest = seq3.clips.filter((c) => c.name === testName).length;
  const restoredOk = stillTest === 0;
  console.log(`    còn clip tên test = ${stillTest} → ${restoredOk ? '✅ KHÔI PHỤC' : '⚠️ chưa khớp'}`);

  console.log('\n=== KẾT QUẢ ===');
  console.log(`  Ghi thật:    ${w1.applied >= 1 ? '✅' : '❌'}`);
  console.log(`  Đọc lại đổi: ${ok ? '✅' : '⚠️'}`);
  console.log(`  Hoàn tác:    ${restoredOk ? '✅' : '⚠️'}`);
  if (w1.applied >= 1 && ok && restoredOk) {
    console.log('\n🎉 ĐƯỜNG GHI HOẠT ĐỘNG — và project đã về NGUYÊN TRẠNG.');
  }
} catch (e) {
  console.log(`\n❌ LỖI: ${e.message}`);
  if (!restored) {
    console.log(`⚠️ NẾU clip "${origName}" bị đổi tên → bấm Ctrl-Z trong Premiere để hoàn tác.`);
  }
}
ws.close();
process.exit(0);

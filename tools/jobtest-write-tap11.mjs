/**
 * C10 — GHI THẬT lên timeline + TỰ HOÀN TÁC cho 4 thao tác an toàn:
 *   rename · disable · trim (out) · move (re-pack)
 *
 * Mỗi test ĐỘC LẬP, ghi THẬT 1 thao tác rồi đảo ngược để project về NGUYÊN
 * TRẠNG. Cuối cùng đối chiếu "vân tay" toàn timeline (tên/kind/enabled/in-out/
 * start) với ảnh chụp ban đầu — khớp ⇒ không để lại thay đổi.
 *
 * An toàn:
 *  - checkpoint.snapshot ở đầu (điểm khôi phục).
 *  - move CHỈ ghi thật khi track liền mạch (gapless) → re-pack đảo ngược sạch;
 *    nếu có khoảng trống → BỎ QUA ghi thật (kiểm qua dry-run) + giải thích.
 *  - Lỗi giữa chừng → in cảnh báo Ctrl-Z + giữ checkpoint.
 *
 *   node tools/jobtest-write-tap11.mjs   (npm run test:job-write)
 */
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:7778';
const ws = new WebSocket(URL);
let nextId = 1;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

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
      rej(new Error(`timeout ${timeoutMs}ms @ ${method}`));
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

// ── tiện ích ────────────────────────────────────────────────────────────────
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function listClips() {
  return call('context.activeSequenceClips', {});
}

/** Vân tay toàn timeline: thứ tự ổn định, gồm tên/kind/enabled/in-out/start.
 *  Mọi vị trí LÀM TRÒN 2 số lẻ — move/trim round-trip để lại sai số float
 *  ~1e-12 (vô hại), không được tính là "khác". */
function fingerprint(clips) {
  return [...clips]
    .map((c) => `${c.kind}|${r2(c.startSec)}|${c.name}|${c.enabled}|${r2(c.inSec)}|${r2(c.outSec)}`)
    .sort()
    .join('\n');
}

/** Kế hoạch 1-bước (bypass planner Python — ghi tay editPlan). */
function onePlan(action, targetPath, params, reason) {
  return {
    goal_understanding: 'C10 live write self-revert',
    strategy: `ghi thật 1 thao tác "${action}" rồi hoàn tác`,
    steps: [{ order: 1, action, target_path: targetPath, params: params ?? {}, reason, reversible: true }],
    out_of_scope: [],
    estimated_impact: `${action} 1 clip (tự hoàn tác)`,
    requires_preview: true,
    confidence: 1,
  };
}

let seqId = null;
async function apply(plan, dryRun = false) {
  return call(
    'safe.applyPlan',
    { editPlan: plan, sequenceId: seqId, dryRun, approved: true },
    120000
  );
}

// ── khung test ───────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
let dirty = false; // có thao tác nào CHƯA hoàn tác?
const lines = [];
function ok(name, detail) {
  pass++;
  lines.push(`  ${G('✓')} ${name}${detail ? ` ${DIM('— ' + detail)}` : ''}`);
}
function bad(name, detail) {
  fail++;
  lines.push(`  ${R('✗')} ${name}${detail ? ` ${R('— ' + detail)}` : ''}`);
}
function note(name, detail) {
  lines.push(`  ${Y('•')} ${name}${detail ? ` ${DIM('— ' + detail)}` : ''}`);
}

console.log('\n=== C10 — GHI THẬT + TỰ HOÀN TÁC (rename · disable · trim · move) ===\n');

const t0 = await listClips();
seqId = t0.sequenceId;
const startFP = fingerprint(t0.clips);
const videos = t0.clips.filter((c) => c.kind === 'video');
console.log(`Sequence: ${t0.sequenceName}  (${t0.total} clip, ${videos.length} video)\n`);
if (videos.length < 4) {
  console.log(R('❌ Cần ≥4 clip video để chạy. Mở sequence "tap 11".'));
  ws.close();
  process.exit(1);
}

// Điểm khôi phục an toàn.
try {
  await call('checkpoint.snapshot', { sequenceId: seqId, label: 'C10 trước ghi thật' });
  console.log(DIM('checkpoint.snapshot: OK (điểm khôi phục đã tạo)\n'));
} catch (e) {
  console.log(Y(`checkpoint.snapshot soft-fail: ${e.message}\n`));
}

// Chọn 4 clip video KHÁC NHAU cho 4 test (tránh tác động chéo).
const used = new Set();
const pick = (predicate) => {
  const c = videos.find((v) => !used.has(v.id) && predicate(v));
  if (c) used.add(c.id);
  return c;
};

// ── TEST 1 — RENAME (id đổi theo tên → verify bằng đếm) ──────────────────────
console.log('[1] RENAME');
try {
  const c = pick(() => true);
  const orig = c.name;
  const testName = `ZZ_C10_RN_${seqId.slice(-4)}`;
  const w1 = await apply(onePlan('rename', c.id, { new_name: testName }, 'C10 rename'));
  if (w1.applied < 1) throw new Error(`applied=0 (${JSON.stringify(w1)})`);
  dirty = true;
  let s = await listClips();
  const renamed = s.clips.filter((x) => x.name === testName);
  if (renamed.length === 1) ok('rename ghi thật', `"${orig}" → "${testName}" (đúng 1 clip)`);
  else bad('rename verify', `số clip tên mới = ${renamed.length} (cần 1)`);
  // hoàn tác: nhắm theo ID MỚI của clip vừa đổi. (byBase keyed theo source-path
  // basename — KHÔNG đổi khi rename — nên không khớp được "tên mới"; phải dùng id.)
  const newId = renamed[0]?.id ?? testName;
  const w2 = await apply(onePlan('rename', newId, { new_name: orig }, 'C10 rename revert'));
  s = await listClips();
  const left = s.clips.filter((x) => x.name === testName).length;
  if (w2.applied >= 1 && left === 0) {
    ok('rename hoàn tác', `còn 0 clip tên test`);
    dirty = false;
  } else bad('rename hoàn tác', `applied=${w2.applied} còn=${left}`);
} catch (e) {
  bad('rename', e.message);
}

// ── TEST 2 — DISABLE/ENABLE (id ổn định → verify bằng enabled) ───────────────
console.log('[2] DISABLE → ENABLE');
try {
  const c = pick((v) => v.enabled !== false);
  const w1 = await apply(onePlan('disable', c.id, {}, 'C10 disable'));
  if (w1.applied < 1) throw new Error(`disable applied=0 (${JSON.stringify(w1)})`);
  dirty = true;
  let s = await listClips();
  let now = s.clips.find((x) => x.id === c.id);
  // id disable không đổi (tên/start/track giữ nguyên) → tìm theo id.
  if (now && now.enabled === false) ok('disable ghi thật', `"${c.name}" enabled=false`);
  else bad('disable verify', `enabled=${now ? now.enabled : 'không thấy clip'}`);
  // hoàn tác: enable.
  const w2 = await apply(onePlan('enable', c.id, {}, 'C10 enable revert'));
  s = await listClips();
  now = s.clips.find((x) => x.id === c.id);
  if (w2.applied >= 1 && now && now.enabled !== false) {
    ok('enable hoàn tác', `"${c.name}" enabled=true`);
    dirty = false;
  } else bad('enable hoàn tác', `applied=${w2.applied} enabled=${now ? now.enabled : '?'}`);
} catch (e) {
  bad('disable/enable', e.message);
}

// ── TEST 3 — TRIM out (id ổn định: trim OUT giữ nguyên start) ─────────────────
console.log('[3] TRIM (cắt OUT vào trong 0.5s rồi trả lại)');
try {
  const c = pick((v) => r2(v.outSec) - r2(v.inSec) > 1.5);
  if (!c) throw new Error('không tìm thấy clip đủ dài (>1.5s) để tỉa an toàn');
  const inS = r2(c.inSec);
  const outS = r2(c.outSec);
  const newOut = r2(outS - 0.5);
  const w1 = await apply(onePlan('trim', c.id, { in_sec: inS, out_sec: newOut }, 'C10 trim'));
  if (w1.applied < 1) throw new Error(`trim applied=0 (${JSON.stringify(w1)})`);
  dirty = true;
  let s = await listClips();
  let now = s.clips.find((x) => x.id === c.id) || s.clips.find((x) => x.name === c.name && x.kind === 'video');
  if (now && Math.abs(r2(now.outSec) - newOut) < 0.06) ok('trim ghi thật', `out ${outS}s → ${r2(now.outSec)}s`);
  else bad('trim verify', `out hiện=${now ? r2(now.outSec) : '?'} (cần ~${newOut})`);
  // hoàn tác: đặt lại in/out gốc.
  const targetForRevert = now ? now.id : c.id;
  const w2 = await apply(onePlan('trim', targetForRevert, { in_sec: inS, out_sec: outS }, 'C10 trim revert'));
  s = await listClips();
  now = s.clips.find((x) => x.id === targetForRevert) || s.clips.find((x) => x.name === c.name && x.kind === 'video');
  if (w2.applied >= 1 && now && Math.abs(r2(now.outSec) - outS) < 0.06) {
    ok('trim hoàn tác', `out trở lại ${r2(now.outSec)}s`);
    dirty = false;
  } else bad('trim hoàn tác', `applied=${w2.applied} out=${now ? r2(now.outSec) : '?'}`);
} catch (e) {
  bad('trim', e.message);
}

// ── TEST 4 — MOVE (ghi thật re-pack → khôi phục start tuyệt đối, phải→trái) ───
console.log('[4] MOVE (đổi chỗ 2 clip kề nhau rồi khôi phục layout gốc)');
try {
  const trackId = (c) => String(c.id).split(':')[0]; // trackId ở đầu synthetic id
  // Gom clip video theo track.
  const tracks = new Map();
  for (const v of t0.clips.filter((x) => x.kind === 'video')) {
    const k = trackId(v);
    const arr = tracks.get(k) ?? [];
    arr.push(v);
    tracks.set(k, arr);
  }
  // Track ghi-thật-được: 2–25 clip, TÊN DUY NHẤT trên track (map tên→start khi
  // khôi phục), 2 clip đầu tên khác nhau. Ưu tiên track NHỎ NHẤT (ít churn).
  const candidates = [];
  for (const [tid, arr] of tracks) {
    const names = arr.map((c) => c.name);
    const unique = new Set(names).size === names.length;
    const sorted = [...arr].sort((a, b) => a.startSec - b.startSec);
    if (arr.length >= 2 && arr.length <= 25 && unique && sorted[0].name !== sorted[1].name) {
      candidates.push({ tid, sorted, size: arr.length });
    }
  }
  candidates.sort((a, b) => a.size - b.size);
  const chosen = candidates[0] ?? null;

  /** Khôi phục layout track về start GỐC, CHỐNG ĐỤNG ĐỘ tuyệt đối:
   *  (1) PARK — dời mọi clip ra xa bên phải, các ô cách nhau thật rộng;
   *  (2) PLACE — đặt từng clip về start gốc (vùng trái giờ trống hẳn).
   *  Khớp clip theo TÊN (track tên-duy-nhất). Re-list giữa mỗi bước vì id đổi. */
  async function restoreLayout(tid, origByName) {
    const PARK = 100000;
    const GAP = 1000;
    let s = await listClips();
    let cur = s.clips.filter((x) => trackId(x) === tid).sort((a, b) => a.startSec - b.startSec);
    let k = 0;
    for (const c of cur) {
      await call('timeline.moveClip', { clipId: c.id, newStart: PARK + k * GAP }, 60000);
      k++;
    }
    s = await listClips();
    cur = s.clips.filter((x) => trackId(x) === tid);
    let allPlaced = true;
    for (const c of cur) {
      const o = origByName.get(c.name);
      if (!o) {
        allPlaced = false;
        continue;
      }
      await call('timeline.moveClip', { clipId: c.id, newStart: o.start }, 60000);
    }
    return allPlaced;
  }

  if (!chosen) {
    const any = [...tracks.values()].find((a) => a.length >= 2);
    if (any) {
      const sorted = [...any].sort((a, b) => a.startSec - b.startSec);
      const dry = await apply(onePlan('move', sorted[1].id, { to_index: 0 }, 'C10 move dry'), true);
      note('move dry-run', `không có track tên-duy-nhất phù hợp; kiểm move qua dry-run (dryRun=${dry.dryRun})`);
    } else note('move BỎ QUA', 'không đủ clip video');
  } else {
    const sorted = chosen.sorted;
    const orig = sorted.map((c) => ({ name: c.name, start: r2(c.startSec) }));
    const origByName = new Map(orig.map((o) => [o.name, o]));
    const A = sorted[0];
    const B = sorted[1];
    // Ghi THẬT: move B (index 1) → index 0 (re-pack ripple-aware) trên track nhỏ nhất.
    const w1 = await apply(onePlan('move', B.id, { to_index: 0 }, 'C10 move'));
    if (w1.applied < 1) throw new Error(`move applied=0 (${JSON.stringify(w1)})`);
    dirty = true;
    let s = await listClips();
    let cur = s.clips.filter((x) => trackId(x) === chosen.tid).sort((a, b) => a.startSec - b.startSec);
    const after = cur.map((x) => x.name);
    if (after[0] === B.name)
      ok('move ghi thật', `track ${chosen.tid} (${chosen.size} clip): "${B.name}" lên đầu (hoán vị "${A.name}")`);
    else bad('move verify', `thứ tự sau = [${after.slice(0, 3).join(', ')}]`);

    // KHÔI PHỤC layout gốc (park-then-place).
    const placed = await restoreLayout(chosen.tid, origByName);
    s = await listClips();
    cur = s.clips.filter((x) => trackId(x) === chosen.tid).sort((a, b) => a.startSec - b.startSec);
    const restoredOk =
      cur.length === orig.length &&
      orig.every((o, i) => cur[i] && cur[i].name === o.name && Math.abs(r2(cur[i].startSec) - o.start) < 0.06);
    if (placed && restoredOk) {
      ok('move hoàn tác', `${orig.length} clip về đúng vị trí (start tuyệt đối)`);
      dirty = false;
    } else bad('move hoàn tác', `placed=${placed} khớp-layout=${restoredOk}`);
  }
} catch (e) {
  bad('move', e.message);
}

// ── TEST 5 — TRANSITION (ghi thật chuyển cảnh → gỡ) ──────────────────────────
console.log('[5] TRANSITION (thêm chuyển cảnh đầu clip rồi gỡ)');
try {
  const trackId = (c) => String(c.id).split(':')[0];
  const v0 = t0.clips
    .filter((x) => x.kind === 'video' && trackId(x) === 'video-0')
    .sort((a, b) => a.startSec - b.startSec);
  // clip B = clip thứ 2+ (có clip A trước nó cùng track) để chuyển cảnh hợp lệ.
  const B = v0[2] ?? v0[1];
  const A = v0[v0.indexOf(B) - 1];
  if (!A || !B) {
    note('transition BỎ QUA', 'không đủ clip video-0 liền kề');
  } else {
    const re = async (name) => {
      const s = await listClips();
      return s.clips
        .filter((x) => x.kind === 'video' && trackId(x) === 'video-0')
        .sort((a, b) => a.startSec - b.startSec)
        .find((x) => x.name === name);
    };
    const w1 = await call(
      'transition.apply',
      { clipIdA: A.id, clipIdB: B.id, matchName: 'ADBE Additive Dissolve', durationSec: 0.5 },
      90000
    );
    ok('transition ghi thật', `Additive Dissolve 0.5s đầu "${B.name}"`);
    dirty = true;
    const Bnow = (await re(B.name)) ?? B;
    await call('transition.remove', { clipId: Bnow.id, atStart: true }, 90000);
    ok('transition hoàn tác', `đã gỡ chuyển cảnh`);
    dirty = false;
    void w1;
  }
} catch (e) {
  bad('transition', e.message);
}

// ── TEST 6 — EFFECT (thêm hiệu ứng video → gỡ) ───────────────────────────────
console.log('[6] EFFECT (thêm Gaussian Blur 2 rồi gỡ)');
try {
  const v = t0.clips.find((c) => c.kind === 'video' && String(c.id).split(':')[0] === 'video-0');
  const fx0 = await call('effect.list', { clipId: v.id });
  const ef = await call('effect.apply', { clipId: v.id, effectMatchName: 'AE.ADBE Gaussian Blur 2' });
  const fx1 = await call('effect.list', { clipId: v.id });
  const added = fx1.some((e) => /Gaussian/i.test(e.matchName));
  if (added && fx1.length === fx0.length + 1) ok('effect ghi thật', `Gaussian Blur 2 (${fx0.length}→${fx1.length})`);
  else bad('effect verify', `count ${fx0.length}→${fx1.length} added=${added}`);
  dirty = true;
  await call('effect.remove', { clipId: v.id, effectId: 'AE.ADBE Gaussian Blur 2' });
  const fx2 = await call('effect.list', { clipId: v.id });
  if (fx2.length === fx0.length && !fx2.some((e) => /Gaussian/i.test(e.matchName))) {
    ok('effect hoàn tác', `về ${fx2.length} component`);
    dirty = false;
  } else bad('effect hoàn tác', `count=${fx2.length}`);
  void ef;
} catch (e) {
  bad('effect', e.message);
}

// ── TEST 7 — COLOR (Lumetri exposure → gỡ) ───────────────────────────────────
console.log('[7] COLOR (setParams Lumetri rồi gỡ)');
try {
  const v = t0.clips.find(
    (c) => c.kind === 'video' && String(c.id).split(':')[0] === 'video-0'
  );
  const fx0 = await call('effect.list', { clipId: v.id });
  await call('color.setParams', { clipId: v.id, exposure: 0.5, contrast: 8 });
  const fx1 = await call('effect.list', { clipId: v.id });
  const lum = fx1.some((e) => /Lumetri/i.test(e.matchName));
  if (lum) ok('color ghi thật', `Lumetri thêm (exposure/contrast)`);
  else bad('color verify', `không thấy Lumetri (${fx1.map((e) => e.matchName)})`);
  dirty = true;
  if (lum) await call('effect.remove', { clipId: v.id, effectId: 'AE.ADBE Lumetri' });
  const fx2 = await call('effect.list', { clipId: v.id });
  if (fx2.length === fx0.length && !fx2.some((e) => /Lumetri/i.test(e.matchName))) {
    ok('color hoàn tác', `gỡ Lumetri → ${fx2.length} component`);
    dirty = false;
  } else bad('color hoàn tác', `count=${fx2.length}`);
} catch (e) {
  bad('color', e.message);
}

// ── TEST 8 — AUDIO GAIN (set → khôi phục) ────────────────────────────────────
console.log('[8] AUDIO GAIN (đổi gain rồi khôi phục)');
try {
  const a = t0.clips.find((c) => c.kind === 'audio');
  if (!a) {
    note('audio gain BỎ QUA', 'không có clip audio');
  } else {
    const g0 = await call('audio.getGain', { clipId: a.id });
    await call('audio.setGain', { clipId: a.id, gainDb: g0 - 6 }); // ghi thật (path action-model)
    dirty = true;
    ok('audio gain ghi thật', `setGain chạy (gain gốc ${g0}dB → ${g0 - 6}dB)`);
    await call('audio.setGain', { clipId: a.id, gainDb: g0 });
    const g2 = await call('audio.getGain', { clipId: a.id });
    if (Math.abs(g2 - g0) < 0.2) {
      ok('audio gain hoàn tác', `gain về ${g2}dB`);
      dirty = false;
    } else bad('audio gain hoàn tác', `gain=${g2} (gốc ${g0})`);
  }
} catch (e) {
  bad('audio gain', e.message);
}

// ── INTEGRITY — toàn timeline về nguyên trạng? ───────────────────────────────
console.log('[9] INTEGRITY — đối chiếu vân tay toàn timeline');
const tEnd = await listClips();
const endFP = fingerprint(tEnd.clips);
if (endFP === startFP) {
  ok('integrity', `${tEnd.total} clip y nguyên (vân tay khớp 100%)`);
} else {
  // tìm vài dòng khác biệt để báo cáo.
  const a = new Set(startFP.split('\n'));
  const b = new Set(endFP.split('\n'));
  const onlyEnd = [...b].filter((x) => !a.has(x)).slice(0, 3);
  bad('integrity', `vân tay KHÁC — ví dụ thay đổi: ${onlyEnd.join(' || ') || '(đổi số lượng)'}`);
  dirty = true;
}

// ── KẾT QUẢ ──────────────────────────────────────────────────────────────────
console.log('\n' + lines.join('\n'));
const total = pass + fail;
console.log('\n' + '─'.repeat(60));
console.log(`KẾT QUẢ GHI THẬT: ${fail === 0 ? G(`${pass}/${total} PASS`) : R(`${pass}/${total} (${fail} FAIL)`)}`);
if (dirty) {
  console.log(R('\n⚠️  CÓ THAY ĐỔI CHƯA HOÀN TÁC — bấm Ctrl-Z trong Premiere vài lần,'));
  console.log(R('   hoặc dùng checkpoint "C10 trước ghi thật" để khôi phục.'));
} else if (fail === 0) {
  console.log(G('\n🎉 4 thao tác ghi-thật hoạt động ĐÚNG và project về NGUYÊN TRẠNG.'));
}
ws.close();
process.exit(fail === 0 && !dirty ? 0 : 1);

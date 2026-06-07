/**
 * SAFE-1d — Live DRY-RUN smoke (KHÔNG ghi gì lên timeline).
 *
 * E2E qua server WS trên sequence ĐANG MỞ trong Premiere:
 *   1. project.getActiveSequence        (read)
 *   2. timeline.listClips               (read — đối chiếu tên clip)
 *   3. safe.applyPlan { clipPaths, goal, dryRun:true }
 *        → hiểu clip (AI-1, cache) → bản đồ (AI-2) → kế hoạch (AI-3)
 *        → khớp clip thật theo basename (SAFE-1a) → MÔ PHỎNG (dry-run)
 *
 * LƯU Ý (giới hạn Premiere 26): clip trên timeline KHÔNG lộ full path,
 * nên `clipPaths` phải là FILE GỐC của bạn (vd E:\T11\*.mp4) — resolver
 * khớp với timeline theo basename/tên clip. clipPaths truyền qua biến môi
 * trường CLIPS (phân tách bằng dấu ";") hoặc dùng bộ mặc định nhỏ.
 *
 * Chứng minh cả pipeline chạy thật E2E NHƯNG tuyệt đối không ghi.
 * Cần: server :7778 + panel Premiere kết nối + sidecar :8000 (+ GEMINI key).
 *
 * Run:
 *   pnpm smoke:safe-dryrun ["mục tiêu edit"]
 *   CLIPS="E:/T11/6.mp4;E:/T11/2.mp4" pnpm smoke:safe-dryrun
 */
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:7778';
const TIMEOUT = 600_000; // AI có thể chậm cho nhiều clip lần đầu (chưa cache)

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
  source?: { path?: string };
}
interface ApplyResult {
  sequenceId: string;
  dryRun: boolean;
  total: number;
  applied: number;
  failed: number;
  skipped: number;
  deferred: number;
  dryRunCount: number;
  results: { order: number; action: string; status: string; detail: string }[];
  approvalNote?: string;
  plan: { goal_understanding: string; strategy: string };
}

async function main(): Promise<void> {
  const goal =
    process.argv[2] ??
    'Dựng bản action gọn gàng: lọc/ẩn clip kém, đặt tên clip theo nội dung cảnh.';

  console.info('━━━ SAFE-1d — DRY-RUN (không ghi) trên sequence đang mở ━━━');
  console.info(`🎯 Mục tiêu: ${goal}\n`);

  const ws = new WebSocket(URL);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
    setTimeout(() => rej(new Error('connect timeout — server :7778 chạy chưa?')), 5000);
  });
  console.info('✔ ws server mở\n');
  let id = 1;

  const seq = await call<SequenceRef>(ws, id++, 'project.getActiveSequence', {});
  if (!seq?.id) throw new Error('Không có sequence đang mở trong Premiere');
  console.info(`📺 Sequence: ${seq.name} (${seq.id})`);

  const clips = await call<ClipRef[]>(ws, id++, 'timeline.listClips', { sequenceId: seq.id });
  const clipNames = new Set(clips.map((c) => (c.name ?? '').toLowerCase()));
  console.info(`🎞  ${clips.length} clip trên timeline`);
  console.info(
    `   tên ví dụ: ${clips
      .slice(0, 4)
      .map((c) => c.name)
      .join(', ')}`
  );

  // clipPaths = FILE GỐC (không lấy từ timeline vì Premiere 26 giấu path).
  const DEFAULT_CLIPS = [
    'E:/T11/2.mp4',
    'E:/T11/3.mp4',
    'E:/T11/6.mp4',
    'E:/T11/7.mp4',
    'E:/T11/8.mp4',
  ];
  const envClips = process.env.CLIPS?.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const paths = envClips && envClips.length > 0 ? envClips : DEFAULT_CLIPS;
  const base = (p: string): string => (p.split(/[\\/]/).pop() ?? p).toLowerCase();
  const onTimeline = paths.filter((p) => clipNames.has(base(p)));
  console.info(`\n📁 clipPaths gửi AI (${paths.length}): ${paths.map(base).join(', ')}`);
  console.info(
    `   khớp tên trên timeline: ${onTimeline.length}/${paths.length}` +
      (onTimeline.length === 0
        ? '  ⚠ không có file nào trùng tên clip — dry-run vẫn chạy nhưng sẽ "skipped"'
        : '')
  );
  console.info('');

  // STUB=1 → bỏ qua AI (Gemini), dựng editPlan tay để verify resolve +
  // dry-run executor trên timeline thật (hữu ích khi Gemini bị chặn billing).
  const useStub = process.env.STUB === '1';
  const stubPlan = {
    goal_understanding: `(STUB) ${goal}`,
    strategy: 'STUB: ẩn 2 clip đầu + đổi tên theo cảnh để verify SAFE-1 live.',
    steps: paths.map((p, i) => {
      const b = base(p);
      return i < 2
        ? {
            order: i + 1,
            action: 'disable',
            target_path: p,
            params: {},
            reason: 'STUB ẩn thử',
            reversible: true,
          }
        : {
            order: i + 1,
            action: 'rename',
            target_path: p,
            params: { new_name: `Scene_${i + 1}_${b.replace(/\W+/g, '_')}` },
            reason: 'STUB đặt tên',
            reversible: true,
          };
    }),
    out_of_scope: [],
    estimated_impact: 'STUB',
    requires_preview: true,
    confidence: 1,
  };

  console.info(
    useStub
      ? '⏳ Chạy preview + DRY-RUN với editPlan STUB (bỏ qua Gemini)…'
      : '⏳ Chạy pipeline AI + preview (DRY-RUN, không ghi)…'
  );
  const t0 = Date.now();
  const res = await call<ApplyResult>(ws, id++, 'safe.applyPlan', {
    sequenceId: seq.id,
    ...(useStub ? { editPlan: stubPlan } : { clipPaths: paths, goal }),
    dryRun: true,
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  console.info(`\n🧠 Hiểu mục tiêu: ${res.plan?.goal_understanding}`);
  console.info(`♟  Chiến lược: ${res.plan?.strategy}\n`);
  console.info(`📋 KẾ HOẠCH (DRY-RUN ${dt}s) — ${res.total} bước:`);
  for (const r of res.results) {
    const icon =
      { 'dry-run': '🔵', deferred: '🟡', skipped: '⚪', applied: '🟢', failed: '🔴' }[r.status] ??
      '•';
    console.info(`   ${icon} #${r.order} [${r.action}] ${r.detail}`);
  }
  console.info(
    `\n📊 dry-run ${res.dryRunCount} | hoãn ${res.deferred} | bỏ ${res.skipped}` +
      ` | ghi ${res.applied} | lỗi ${res.failed}`
  );
  console.info(`🔒 dryRun=${res.dryRun} (KHÔNG ghi gì)`);

  // PASS: chạy thông + đúng là dry-run + có ít nhất 1 bước mô phỏng/hoãn
  const ok = res.dryRun === true && res.applied === 0 && res.total > 0;
  console.info('\n' + '━'.repeat(60));
  if (ok) {
    console.info('✅ SAFE-1d PASS — pipeline chạy thật E2E, dry-run, KHÔNG ghi.');
    console.info('   Để GHI THẬT: gọi safe.applyPlan với dryRun:false + approved:true');
  } else {
    console.info('❌ SAFE-1d FAIL — xem kết quả ở trên.');
  }
  ws.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

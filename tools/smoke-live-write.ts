/**
 * C9 — Smoke GHI THẬT an toàn nhất: đổi tên 1 clip (reversible) trên
 * sequence ĐANG MỞ, rồi verify + nhắc Undo. Đóng gap #1 (chưa ghi live lần nào).
 *
 * AN TOÀN: rename chỉ đổi nhãn, KHÔNG đụng nội dung/vị trí. Có checkpoint +
 * Undo. Khuyến nghị mở 1 sequence TEST nhỏ trước khi chạy.
 *
 * Run:  pnpm tsx tools/smoke-live-write.ts
 */
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:7778';

interface Resp {
  id?: number;
  result?: unknown;
  error?: { message: string };
}
function call<T>(ws: WebSocket, id: number, method: string, params?: unknown): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${method} timeout`)), 120_000);
    const h = (raw: WebSocket.RawData): void => {
      const m = JSON.parse(raw.toString()) as Resp;
      if (m.id !== id) return;
      ws.off('message', h);
      clearTimeout(t);
      m.error ? rej(new Error(m.error.message)) : res(m.result as T);
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}

interface Clip {
  id: string;
  name: string;
  kind: string;
  source?: { path?: string };
}

async function main(): Promise<void> {
  console.info('━━━ C9 — GHI THẬT live: đổi tên 1 clip (reversible) ━━━\n');
  const ws = new WebSocket(URL);
  await new Promise<void>((r, j) => {
    ws.once('open', () => r());
    ws.once('error', j);
    setTimeout(() => j(new Error('connect timeout — server :7778?')), 5000);
  });

  const seq = await call<{ id: string; name: string }>(ws, 1, 'project.getActiveSequence', {});
  if (!seq?.id) throw new Error('Không có sequence đang mở');
  console.info(`📺 Sequence: ${seq.name}`);
  const clips = await call<Clip[]>(ws, 2, 'timeline.listClips', { sequenceId: seq.id });
  const vid = clips.find((c) => c.kind === 'video');
  if (!vid) throw new Error('Sequence không có clip video');
  console.info(`🎞  Clip thử: "${vid.name}" (${vid.id})`);
  if (clips.length > 30) {
    console.info(`⚠ Sequence có ${clips.length} clip — khuyến nghị dùng sequence TEST nhỏ.`);
  }

  const newName = `DAI_TEST_${vid.name}`.slice(0, 40);
  const editPlan = {
    goal_understanding: 'C9 live write verify',
    strategy: 'Đổi tên 1 clip (reversible) để chứng minh ghi live.',
    steps: [
      {
        order: 1,
        action: 'rename',
        target_path: vid.source?.path || vid.name,
        params: { new_name: newName },
        reason: 'C9 verify',
        reversible: true,
      },
    ],
    out_of_scope: [],
    estimated_impact: 'đổi tên 1 clip',
    requires_preview: true,
    confidence: 1,
  };

  console.info(`\n⏳ GHI THẬT: rename "${vid.name}" → "${newName}" (approved)…`);
  const res = await call<{
    applied: number;
    failed: number;
    dryRun: boolean;
    checkpointId?: string;
    results: { detail: string }[];
  }>(ws, 3, 'safe.applyPlan', {
    sequenceId: seq.id,
    editPlan,
    dryRun: false,
    approved: true,
  });

  console.info(`   checkpoint: ${res.checkpointId ?? '(none)'} | dryRun=${res.dryRun}`);
  console.info(`   kết quả: ${res.results[0]?.detail}`);

  // Verify: list lại, tìm clip có tên mới.
  const after = await call<Clip[]>(ws, 4, 'timeline.listClips', { sequenceId: seq.id });
  const renamed = after.some((c) => c.name === newName);

  console.info('\n' + '━'.repeat(56));
  if (res.applied === 1 && res.failed === 0 && renamed) {
    console.info(`✅ C9 PASS — GHI LIVE THÀNH CÔNG. Clip giờ tên "${newName}".`);
    console.info('   ↩ Nhấn Ctrl-Z trong Premiere để hoàn tác (về tên cũ).');
    ws.close();
    process.exit(0);
  }
  console.info(`❌ C9 FAIL — applied=${res.applied} failed=${res.failed} renamed=${renamed}`);
  ws.close();
  process.exit(1);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

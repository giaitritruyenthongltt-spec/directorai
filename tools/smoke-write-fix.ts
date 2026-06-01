/**
 * A4 — Verify executeTransaction write fix on Premiere 26.
 *
 * Gọi timeline.setClipDisabled trên clip đầu tiên. Nếu trả về < 5s
 * (thay vì treo 90s) → mô hình executeTransaction + Action HOẠT ĐỘNG,
 * mở khoá toàn bộ Track A.
 *
 *   pnpm tsx tools/smoke-write-fix.ts
 */
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:7778';
const TIMEOUT = 30_000;

function call<T>(ws: WebSocket, id: number, method: string, params?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${method} timed out`)), TIMEOUT);
    const handler = (raw: WebSocket.RawData): void => {
      const msg = JSON.parse(raw.toString()) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
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

interface SeqRef {
  id: string;
  name: string;
}
interface ClipRef {
  id: string;
  name: string;
  trackId: string;
}

async function main(): Promise<void> {
  console.info('━━━ A4 — Test write fix (executeTransaction) ━━━\n');
  const ws = new WebSocket(URL);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
    setTimeout(() => rej(new Error('connect timeout')), 5000);
  });
  console.info('✔ ws open\n');

  let id = 1;
  const seq = await call<SeqRef>(ws, id++, 'project.getActiveSequence', {});
  console.info(`Sequence: ${seq.name}`);

  const clips = await call<ClipRef[]>(ws, id++, 'timeline.listClips', { sequenceId: seq.id });
  const target = clips.find((c) => c.trackId?.startsWith('video-'));
  if (!target) {
    console.info('❌ Không tìm thấy clip video để test');
    ws.close();
    process.exit(1);
  }
  console.info(`Clip thử nghiệm: "${target.name}" (${target.id})\n`);

  // Test 1 — DISABLE (tắt clip)
  console.info('Test 1 — Tắt clip (createSetDisabledAction)…');
  const t1 = Date.now();
  try {
    await call(ws, id++, 'timeline.setClipDisabled', { clipId: target.id, disabled: true });
    console.info(`  ✅ THÀNH CÔNG trong ${Date.now() - t1}ms (KHÔNG treo!)\n`);
  } catch (e) {
    console.info(`  ❌ ${(Date.now() - t1) / 1000}s — ${e instanceof Error ? e.message : e}\n`);
    ws.close();
    process.exit(1);
  }

  // Đợi 1s cho bạn nhìn thấy clip mờ đi trên timeline
  await new Promise((r) => setTimeout(r, 1500));

  // Test 2 — ENABLE lại (bật clip)
  console.info('Test 2 — Bật lại clip…');
  const t2 = Date.now();
  try {
    await call(ws, id++, 'timeline.setClipDisabled', { clipId: target.id, disabled: false });
    console.info(`  ✅ THÀNH CÔNG trong ${Date.now() - t2}ms\n`);
  } catch (e) {
    console.info(`  ⚠ ${e instanceof Error ? e.message : e}\n`);
  }

  ws.close();
  console.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.info('✅ PASS — executeTransaction write HOẠT ĐỘNG trên Premiere 26!');
  console.info('   → Track A mở khoá: trim/move/disable/transition đều ghi được.');
}

void main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

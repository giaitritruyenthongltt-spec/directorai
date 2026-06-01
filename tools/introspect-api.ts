/**
 * A1 — Gọi _debug.introspect qua server để dump API surface thật của
 * Premiere 26. Kết quả in ra + ghi vào tools/introspect-result.json.
 *
 *   pnpm tsx tools/introspect-api.ts
 */
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = 'ws://127.0.0.1:7778';

async function main(): Promise<void> {
  const ws = new WebSocket(URL);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
    setTimeout(() => rej(new Error('connect timeout')), 5000);
  });
  console.info('✔ ws open — gọi _debug.introspect…\n');

  const result = await new Promise<Record<string, unknown>>((res, rej) => {
    const t = setTimeout(() => rej(new Error('introspect timed out')), 30_000);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as {
        id?: number;
        result?: Record<string, unknown>;
        error?: { message: string };
      };
      if (msg.id !== 1) return;
      clearTimeout(t);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result ?? {});
    });
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: '_debug.introspect' }));
  });

  ws.close();

  // In gọn — chỉ các action factories + đếm số method mỗi cấp
  const levels = ['module', 'project', 'sequence', 'track', 'trackItem', 'projectItem', 'markers'];
  console.info('─── Số method mỗi cấp ───');
  for (const lv of levels) {
    const members = result[lv] as string[] | undefined;
    if (members) console.info(`  ${lv.padEnd(12)} ${members.length} method`);
  }
  console.info('\n─── ACTION FACTORIES tìm được ───');
  for (const lv of levels) {
    const acts = result[`${lv}Actions`] as string[] | undefined;
    if (acts && acts.length) {
      console.info(`  [${lv}]`);
      for (const a of acts) console.info(`     • ${a}`);
    }
  }
  if (result.note) console.info(`\nGhi chú: ${String(result.note)}`);
  if (result.trackError) console.info(`Lỗi track: ${String(result.trackError)}`);

  const out = resolve(import.meta.dirname ?? '.', 'introspect-result.json');
  writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8');
  console.info(`\n📄 Đầy đủ → ${out}`);
}

void main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

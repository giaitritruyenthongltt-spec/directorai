/**
 * Tích hợp: ws-server PHẢI ghi mọi mutation vào ops.log + GUARD mock.
 *  1. Không có panel → mutation chạy mock → ops.log có `mutate adapter=mock`.
 *  2. requirePanelForMutation=true + không panel → TỪ CHỐI (error) + mutate.error.
 *  3. Đọc (non-mutating) KHÔNG sinh event mutate.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockPremiereAdapter } from '@directorai/premiere-adapter';
import { startWebSocketServer, type RunningWsServer } from '../ws-server.js';

const noop = (..._a: unknown[]): void => void _a;
const silent = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: () => silent,
};

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'wsmut-'));
  process.env.DIRECTORAI_DATA_DIR = dir;
});
afterAll(() => {
  delete process.env.DIRECTORAI_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

function events(): Record<string, unknown>[] {
  const p = join(dir, 'ops.log');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}
function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
}
function rpc(ws: WebSocket, id: number, method: string, params: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const h = (raw: WebSocket.RawData): void => {
      const m = JSON.parse(raw.toString());
      if (m.id !== id) return;
      ws.off('message', h);
      resolve(m);
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    setTimeout(() => reject(new Error('rpc timeout')), 3000);
  });
}

describe('ws-server mutation logging (mock, không panel)', () => {
  let server: RunningWsServer;
  beforeAll(async () => {
    server = await startWebSocketServer({
      host: '127.0.0.1',
      port: 17820,
      logger: silent as never,
      fallbackAdapter: new MockPremiereAdapter(),
    });
  });
  afterAll(async () => server.close());

  it('mutation → ops.log có event mutate adapter=mock + mockWarning', async () => {
    const ws = new WebSocket('ws://127.0.0.1:17820');
    await waitOpen(ws);
    const path = 'TEST_MOCK_IMPORT.mp4';
    const res = await rpc(ws, 1, 'media.import', { path });
    expect(res.result ?? res.error).toBeDefined(); // chạy (mock trả id)
    const ev = events().find(
      (e) => e.event === 'mutate' && (e.params as { path?: string } | undefined)?.path === path
    );
    expect(ev, 'phải có event mutate cho media.import').toBeDefined();
    expect(ev!.adapter).toBe('mock');
    expect(ev!.mockWarning).toBeTruthy();
    ws.close();
  });

  it('đọc (project.get) KHÔNG sinh event mutate', async () => {
    const ws = new WebSocket('ws://127.0.0.1:17820');
    await waitOpen(ws);
    const before = events().filter((e) => e.event === 'mutate').length;
    await rpc(ws, 2, 'project.get', {});
    const after = events().filter((e) => e.event === 'mutate').length;
    expect(after).toBe(before);
    ws.close();
  });
});

describe('ws-server GUARD requirePanelForMutation', () => {
  let server: RunningWsServer;
  beforeAll(async () => {
    server = await startWebSocketServer({
      host: '127.0.0.1',
      port: 17821,
      logger: silent as never,
      fallbackAdapter: new MockPremiereAdapter(),
      requirePanelForMutation: true,
    });
  });
  afterAll(async () => server.close());

  it('mutation lúc không panel → BỊ TỪ CHỐI (error) + mutate.error adapter=mock', async () => {
    const ws = new WebSocket('ws://127.0.0.1:17821');
    await waitOpen(ws);
    const path = 'TEST_GUARD_IMPORT.mp4';
    const res = await rpc(ws, 1, 'media.import', { path });
    expect(res.error, 'phải trả lỗi từ chối').toBeDefined();
    expect(String(res.error.message)).toMatch(/REQUIRE_PANEL|từ chối|panel/i);
    const ev = events().find(
      (e) =>
        e.event === 'mutate.error' && (e.params as { path?: string } | undefined)?.path === path
    );
    expect(ev, 'phải có mutate.error cho lệnh bị từ chối').toBeDefined();
    expect(ev!.adapter).toBe('mock');
    ws.close();
  });
});

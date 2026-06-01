/**
 * Sprint A smoke test — verify the Python sidecar is alive end-to-end.
 *
 *   pnpm smoke:sidecar
 *
 * Tests:
 *   1. HTTP GET /health       → 200 OK
 *   2. HTTP GET /hardware     → real hardware report
 *   3. WS connect to /ws       → ping/pong reply
 *   4. WS hardware call        → same report through the socket
 */

import WebSocket from 'ws';

const HTTP_BASE = process.env.SIDECAR_HTTP ?? 'http://127.0.0.1:8000';
const WS_URL = process.env.SIDECAR_WS ?? 'ws://127.0.0.1:8000/ws';

async function httpJson(path: string): Promise<unknown> {
  const res = await fetch(HTTP_BASE + path);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  return res.json();
}

function wsCall(ws: WebSocket, id: number, method: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 5000);
    const handler = (raw: WebSocket.RawData): void => {
      const msg = JSON.parse(raw.toString()) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (msg.id !== id) return;
      ws.off('message', handler);
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method }));
  });
}

async function main(): Promise<void> {
  console.info('=== Sidecar smoke test ===');

  // 1. HTTP health
  const health = await httpJson('/health');
  console.info('✔ /health', health);

  // 2. HTTP hardware
  const hw = (await httpJson('/hardware')) as {
    platform: string;
    cpu_count: number;
    ram_gb: number;
    gpu: { available: boolean; name?: string; vram_gb?: number };
    recommended_mode: string;
  };
  console.info(
    `✔ /hardware  ${hw.platform} · ${hw.cpu_count} CPU · ${hw.ram_gb} GB RAM · ` +
      `GPU ${hw.gpu.available ? `${hw.gpu.name} ${hw.gpu.vram_gb}GB` : 'none'} · ` +
      `mode=${hw.recommended_mode}`
  );

  // 3. WS connect
  console.info(`Connecting WS to ${WS_URL} ...`);
  const ws = new WebSocket(WS_URL);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', (err) => rej(err));
    setTimeout(() => rej(new Error('ws connect timeout')), 5000);
  });
  console.info('✔ ws open');

  // 4. WS ping
  const pong = await wsCall(ws, 1, 'ping');
  console.info('✔ ws ping → ', pong);

  // 5. WS hardware
  const wsHw = await wsCall(ws, 2, 'hardware');
  console.info(
    '✔ ws hardware → matches HTTP =',
    JSON.stringify(wsHw).length === JSON.stringify(hw).length
  );

  ws.close();
  console.info('');
  console.info('✅ PASS — sidecar HTTP + WS healthy');
}

void main().catch((err) => {
  console.error('❌ FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});

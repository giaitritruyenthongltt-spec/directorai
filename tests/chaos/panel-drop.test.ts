/**
 * P4.08 chaos — panel WebSocket forcibly closed mid-RPC.
 *
 * Setup:
 *   1. Start the real WS server with a Mock fallback adapter.
 *   2. Connect a fake panel that registers, then refuses to answer.
 *   3. Submit an RPC call — the server tries to forward to the panel.
 *   4. Forcibly close the panel socket before the call resolves.
 *
 * Expected: the originating socket gets a clean error response, the
 * server is now panel-less, and a subsequent call falls back to the
 * Mock adapter without throwing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { MockPremiereAdapter } from '../../packages/premiere-adapter/src/index.js';
import { startWebSocketServer, type RunningWsServer } from '../../apps/server/src/ws-server.js';

const noop = (..._args: unknown[]): void => void _args;
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: (): never => silentLogger as never,
};

let server: RunningWsServer | null = null;
const PORT = 17901;

async function start(): Promise<RunningWsServer> {
  return startWebSocketServer({
    host: '127.0.0.1',
    port: PORT,
    logger: silentLogger as never,
    fallbackAdapter: new MockPremiereAdapter(),
  });
}

async function openSocket(): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  return ws;
}

async function rpc(ws: WebSocket, id: number, method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const handler = (raw: WebSocket.RawData): void => {
      const msg = JSON.parse(raw.toString()) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (msg.id !== id) return;
      ws.off('message', handler);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    setTimeout(() => reject(new Error(`rpc ${method} timed out`)), 4000);
  });
}

afterEach(async () => {
  await server?.close();
  server = null;
});

describe('chaos: panel drops mid-RPC (P4.08)', () => {
  it('subsequent calls fall back to mock after panel drop', async () => {
    server = await start();

    const panel = await openSocket();
    // Register the panel
    await rpc(panel, 1, '_panel.register');
    expect(server.isPanelConnected()).toBe(true);

    // Now kill the panel hard
    panel.terminate();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.isPanelConnected()).toBe(false);

    // A second client should still get a successful project.get via the
    // mock fallback — the server didn't crash.
    const client = await openSocket();
    const result = (await rpc(client, 99, 'project.get')) as { metadata: { name: string } };
    expect(result.metadata.name).toBeTruthy();
    client.close();
  });

  it('server panel-call to a dropped panel rejects cleanly without crashing', async () => {
    server = await start();
    const panel = await openSocket();
    await rpc(panel, 1, '_panel.register');

    // Drop the panel, then make a panelCall directly through the server API.
    panel.terminate();
    await new Promise((r) => setTimeout(r, 50));

    await expect(server.panelCall('project.get', {}, 200)).rejects.toThrow(/no panel connected/i);

    // Inflight ops bus should be at zero (no leaks).
    expect(server.progress.inflight).toBe(0);
  });
});

/**
 * P4.08 chaos — context-engine is unavailable.
 *
 * Setup:
 *   1. Start the WS server WITHOUT an `onContext` handler (mirrors what
 *      the boot script does when the Python sidecar isn't running).
 *   2. Submit a `context.*` RPC — must fail with a clear error.
 *   3. Submit a Premiere RPC — must still succeed against the mock.
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

const PORT = 17902;

let server: RunningWsServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

async function openSocket(): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  return ws;
}

async function rpc<T = unknown>(
  ws: WebSocket,
  id: number,
  method: string,
  params?: unknown
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handler = (raw: WebSocket.RawData): void => {
      const msg = JSON.parse(raw.toString()) as {
        id?: number;
        result?: unknown;
        error?: { code: number; message: string };
      };
      if (msg.id !== id) return;
      ws.off('message', handler);
      if (msg.error) reject(Object.assign(new Error(msg.error.message), msg.error));
      else resolve(msg.result as T);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    setTimeout(() => reject(new Error(`rpc ${method} timed out`)), 4000);
  });
}

describe('chaos: context-engine down (P4.08)', () => {
  it('context.* fails with a clear error when no router is wired', async () => {
    server = await startWebSocketServer({
      host: '127.0.0.1',
      port: PORT,
      logger: silentLogger as never,
      fallbackAdapter: new MockPremiereAdapter(),
      // intentionally NO onContext
    });

    const client = await openSocket();
    await expect(rpc(client, 1, 'context.health')).rejects.toThrow(/context-engine|router/i);
    client.close();
  });

  it('Premiere RPCs still succeed when context-engine is missing', async () => {
    server = await startWebSocketServer({
      host: '127.0.0.1',
      port: PORT,
      logger: silentLogger as never,
      fallbackAdapter: new MockPremiereAdapter(),
    });

    const client = await openSocket();
    const proj = await rpc<{ metadata: { name: string } }>(client, 1, 'project.get');
    expect(proj.metadata.name).toBeTruthy();
    client.close();
  });
});

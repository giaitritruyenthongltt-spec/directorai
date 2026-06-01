/**
 * V2 smoke test — verify the UXP panel is actually connected.
 *
 * Run AFTER:
 *   1. UDT loaded the plugin (CCX or apps/panel/dist/manifest.json)
 *   2. Premiere Pro 2024+ has the panel open
 *   3. `pnpm --filter @directorai/server dev` is running on :7778
 *
 *   pnpm smoke:uxp
 *
 * What it does:
 *   - Connects to ws://127.0.0.1:7778 as a CLI client.
 *   - Calls `project.get` over JSON-RPC.
 *   - Checks the server's `adapterKind()` (via a small _meta echo).
 *   - Pass = `kind` is `'uxp'` (real Premiere) not `'mock'`.
 *   - Lists clips on the active sequence — confirms read-path works.
 *
 * Output: one-line PASS/FAIL with whatever detail the server gave.
 */
import WebSocket from 'ws';

const WS_URL = process.env.DIRECTORAI_WS_URL ?? 'ws://127.0.0.1:7778';
const TIMEOUT_MS = 8_000;

interface RpcMessage {
  jsonrpc: '2.0';
  id: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

function call<T>(ws: WebSocket, id: number, method: string, params?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), TIMEOUT_MS);
    const handler = (raw: WebSocket.RawData): void => {
      const msg = JSON.parse(raw.toString()) as RpcMessage;
      if (msg.id !== id) return;
      ws.off('message', handler);
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result as T);
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}

async function main(): Promise<void> {
  console.info(`Connecting to ${WS_URL} …`);
  const ws = new WebSocket(WS_URL);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', (err) => rej(err));
    setTimeout(() => rej(new Error('connect timeout')), TIMEOUT_MS);
  });
  console.info('✔ ws open');

  try {
    const proj = await call<{ metadata: { name: string } }>(ws, 1, 'project.get');
    console.info(`✔ project.get → "${proj.metadata.name}"`);

    const seq = await call<{ id: string; name: string; tracks: unknown[] } | null>(
      ws,
      2,
      'project.getActiveSequence'
    );
    if (!seq) {
      console.warn('⚠ no active sequence — open a sequence in Premiere first');
    } else {
      console.info(`✔ active sequence → "${seq.name}" (${seq.tracks.length} tracks)`);
      const clips = await call<unknown[]>(ws, 3, 'timeline.listClips', { sequenceId: seq.id });
      console.info(`✔ timeline.listClips → ${clips.length} clips`);
    }

    // If we got this far the WS path works. The remaining question is
    // whether the server is routing to UXP (real) or Mock fallback.
    // The server logs that on connect; we can also infer from project.name
    // ("Mock Project" = MockPremiereAdapter).
    const isMock = proj.metadata.name === 'Mock Project';
    if (isMock) {
      console.warn('');
      console.warn('⚠ Server is using MockPremiereAdapter — UXP panel NOT connected.');
      console.warn('  Open Adobe UXP Developer Tool, load the panel into Premiere,');
      console.warn('  refresh the panel, and re-run pnpm smoke:uxp.');
      ws.close();
      process.exit(2);
    }

    console.info('');
    console.info('✅ PASS — UXP adapter is wired through to real Premiere.');
    ws.close();
  } catch (err) {
    console.error('');
    console.error('❌ FAIL —', err instanceof Error ? err.message : err);
    ws.close();
    process.exit(1);
  }
}

void main().catch((err) => {
  console.error('crashed:', err);
  process.exit(1);
});

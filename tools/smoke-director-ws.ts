/**
 * Sprint H.2 smoke — verify director.* RPC methods over WebSocket.
 * Simulates what the panel does without needing the panel running.
 *
 *   pnpm smoke:director-ws
 */
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:7778';

function call<T>(ws: WebSocket, id: number, method: string, params?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${method} timed out`)), 60_000);
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

async function main(): Promise<void> {
  console.info(`Connecting to ${URL}…`);
  const ws = new WebSocket(URL);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
    setTimeout(() => rej(new Error('connect timeout')), 5000);
  });
  console.info('✔ ws open');

  // 1. Generate a plan
  console.info('\nCalling director.plan…');
  const t0 = Date.now();
  const plan = await call<{
    title: string;
    steps: { id: number; tool: string; why: string }[];
    estimatedMinutes: number;
  }>(ws, 1, 'director.plan', {
    goal: 'Cut bỏ tất cả silence trên track audio 1',
    persona: 'vlog',
  });
  const elapsed = Date.now() - t0;
  console.info(`✔ director.plan returned in ${elapsed}ms`);
  console.info(`  title: ${plan.title}`);
  console.info(`  ETA:   ${plan.estimatedMinutes} min`);
  console.info(`  steps: ${plan.steps.length}`);
  for (const s of plan.steps.slice(0, 5)) {
    console.info(`    ${s.id}. ${s.tool} — ${s.why}`);
  }

  // 2. Execute (will run with mock adapter since panel not connected)
  console.info('\nCalling director.execute…');
  const { planId } = await call<{ planId: string }>(ws, 2, 'director.execute', { plan });
  console.info(`✔ execute → planId=${planId}`);

  // 3. Poll progress
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const p = await call<{ status: string; currentStep: number; totalSteps: number }>(
      ws,
      10 + i,
      'director.progress',
      { planId }
    );
    console.info(`  progress: ${p.currentStep}/${p.totalSteps} · ${p.status}`);
    if (p.status === 'done' || p.status === 'error' || p.status === 'cancelled') break;
  }

  ws.close();
  console.info('\n✅ PASS — director.* RPC pipeline alive over WS');
}

void main().catch((err) => {
  console.error('❌ FAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});

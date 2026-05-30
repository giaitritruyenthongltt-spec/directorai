/**
 * P4.01 — Panel cold-start performance benchmark.
 *
 * Measures three things you can't easily eyeball in a real UXP load:
 *
 *   1. **Bundle size**  — `apps/panel/dist/bundle.js` byte size, gzipped
 *      size, and parsed module count. Proxy for parse + evaluate cost
 *      in UXP's V8.
 *   2. **Cold module load** — time to `import()` the dispatcher + style
 *      engine + cut planner from disk. Approximates what happens the
 *      first time the panel touches its workspace deps.
 *   3. **Time-to-first-tool (TTFT)** — spins up a fake JSON-RPC server
 *      on a free port, the panel's ws-client equivalent connects to
 *      it, and we measure connect → register → first-tool-result
 *      latency end-to-end.
 *
 * Writes a Markdown report next to itself and updates the baseline
 * row in `docs/perf-baseline.md`.
 *
 * Usage:
 *   pnpm bench:perf
 *   # or
 *   tsx tools/perf-bench.ts
 *
 * Exit code: 0 if all three measurements were captured, 1 otherwise.
 * Does NOT fail on regression — budget enforcement is P4.14/P4.15/P4.16.
 */

import { promises as fs } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const BUNDLE_PATH = path.join(ROOT, 'apps', 'panel', 'dist', 'bundle.js');
const BASELINE_PATH = path.join(ROOT, 'docs', 'perf-baseline.md');

interface Measurement {
  name: string;
  unit: string;
  value: number;
  budget?: number;
  notes?: string;
}

const ms = (n: number): string => `${n.toFixed(1)}ms`;
const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)}KB`;

async function measureBundle(): Promise<Measurement[]> {
  try {
    const raw = await fs.readFile(BUNDLE_PATH);
    const gz = gzipSync(raw);
    const moduleCount = (raw.toString('utf8').match(/__webpack_require__\.\w+/g) ?? []).length;
    return [
      { name: 'bundle.raw', unit: 'KB', value: raw.byteLength / 1024 },
      { name: 'bundle.gzip', unit: 'KB', value: gz.byteLength / 1024 },
      { name: 'bundle.modules', unit: 'count', value: moduleCount },
    ];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return [
      {
        name: 'bundle.raw',
        unit: 'KB',
        value: -1,
        notes: `bundle missing — run "pnpm --filter @directorai/panel build" first (${msg})`,
      },
    ];
  }
}

async function measureColdModuleLoad(): Promise<Measurement[]> {
  const t0 = performance.now();
  await Promise.all([
    import('../packages/premiere-adapter/src/index.js'),
    import('../packages/style-engine/src/index.js'),
    import('../packages/cut-planner/src/index.js'),
  ]);
  const t1 = performance.now();
  return [{ name: 'module.coldLoad', unit: 'ms', value: t1 - t0 }];
}

async function measureTimeToFirstTool(): Promise<Measurement[]> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 }, async () => {
      const address = wss.address();
      if (!address || typeof address === 'string') {
        wss.close();
        resolve([{ name: 'ttft.connectToFirstTool', unit: 'ms', value: -1, notes: 'no port' }]);
        return;
      }
      const url = `ws://127.0.0.1:${address.port}`;

      wss.on('connection', (ws) => {
        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as { id?: number; method?: string };
            if (msg.method === '_panel.register') {
              ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: true } }));
            } else if (msg.method === 'project.get') {
              ws.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: msg.id,
                  result: { metadata: { name: 'bench' } },
                })
              );
            }
          } catch {
            /* ignore */
          }
        });
      });

      const tStart = performance.now();
      const ws = new WsClient(url);
      let connectAt = 0;
      let firstResultAt = 0;

      ws.on('open', () => {
        connectAt = performance.now();
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: '_panel.register', params: {} }));
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'project.get', params: {} }));
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { id?: number };
          if (msg.id === 2 && firstResultAt === 0) {
            firstResultAt = performance.now();
            ws.close();
            wss.close();
            resolve([
              { name: 'ttft.connect', unit: 'ms', value: connectAt - tStart, budget: 200 },
              {
                name: 'ttft.connectToFirstTool',
                unit: 'ms',
                value: firstResultAt - tStart,
                budget: 500,
              },
            ]);
          }
        } catch {
          /* ignore */
        }
      });

      ws.on('error', () => {
        wss.close();
        resolve([
          {
            name: 'ttft.connectToFirstTool',
            unit: 'ms',
            value: -1,
            notes: 'ws error',
          },
        ]);
      });
    });
  });
}

function formatRow(m: Measurement): string {
  if (m.value < 0) {
    return `| \`${m.name}\` | — | — | ⚠️ ${m.notes ?? 'n/a'} |`;
  }
  const formatted =
    m.unit === 'ms' ? ms(m.value) : m.unit === 'KB' ? kb(m.value * 1024) : `${m.value}`;
  const budget = m.budget ? `≤ ${m.unit === 'ms' ? ms(m.budget) : `${m.budget}${m.unit}`}` : '—';
  const status = m.budget ? (m.value <= m.budget ? '✅' : '🔴') : '➖';
  return `| \`${m.name}\` | ${formatted} | ${budget} | ${status} ${m.notes ?? ''} |`;
}

async function main(): Promise<void> {
  console.log('Running P4.01 panel cold-start benchmark…');

  const bundle = await measureBundle();
  const cold = await measureColdModuleLoad();
  const ttft = await measureTimeToFirstTool();
  const all = [...bundle, ...cold, ...ttft];

  const date = new Date().toISOString().slice(0, 10);
  const tableHeader = '| Metric | Value | Budget | Status |\n| --- | --- | --- | --- |';
  const table = all.map(formatRow).join('\n');
  const report = `# Panel Cold-Start Baseline

Last run: \`${date}\` via \`pnpm bench:perf\`.

Captured by [\`tools/perf-bench.ts\`](../tools/perf-bench.ts) to give us
something concrete to regress against in P4.14 / P4.15 / P4.16. The
budget column is the P4.14/15/16 target, not a hard CI gate yet —
those land in Section C.

${tableHeader}
${table}

## How to read

- **bundle.raw / bundle.gzip** — direct file size of
  \`apps/panel/dist/bundle.js\`. UXP parses the raw file; gzip is what
  matters for installer payload (P4.22).
- **module.coldLoad** — Node \`import()\` time for the three heaviest
  workspace deps. Acts as a proxy for first-touch evaluation cost.
- **ttft.connect** — ws open latency against a localhost WSS.
- **ttft.connectToFirstTool** — total open + register + first
  \`project.get\` round-trip. The user-visible "I see something useful"
  moment.

## Reproduce

\`\`\`
pnpm --filter @directorai/panel build
pnpm bench:perf
\`\`\`
`;

  await fs.writeFile(BASELINE_PATH, report, 'utf8');
  console.log(`\nWrote ${path.relative(ROOT, BASELINE_PATH)}`);
  console.log('\n' + tableHeader);
  console.log(table);

  const failed = all.some((m) => m.value < 0);
  process.exit(failed ? 1 : 0);
}

void main();

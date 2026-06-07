/** Verify AN1 dedupe live: gửi path TRÙNG 3× → summary.total phải = 1. */
import WebSocket from 'ws';
const VIDEO = process.argv[2] ?? 'C:\\Users\\KENLY\\AppData\\Local\\Temp\\recut_batch_test\\ep01.mp4';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p = {}, t = 120000) {
  const i = id++;
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout')), t);
    const h = (raw) => {
      let x;
      try {
        x = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (x.id !== i) return;
      ws.off('message', h);
      clearTimeout(to);
      x.error ? rej(new Error(x.error.message)) : res(x.result);
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: i, method: m, params: p }));
  });
}
try {
  const r = await call('context.qualityReport', { clipPaths: [VIDEO, VIDEO, VIDEO] });
  console.log(JSON.stringify({ total: r.summary?.total, rows: (r.rows ?? []).length }, null, 2));
  console.log(r.summary?.total === 1 ? 'PASS: dedupe (3 trùng → total=1)' : `FAIL: total=${r.summary?.total}`);
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

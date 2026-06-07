/** Verify FB2 dedupe live: gửi path TRÙNG 3× → analyzed phải = 1. */
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
  const r = await call('context.planDeadAir', { clipPaths: [VIDEO, VIDEO, VIDEO] });
  const analyzed = r.clips_understood ?? r.analyzed;
  console.log(JSON.stringify({ analyzed, clips_failed: r.clips_failed, total_trims: r.total_trims }, null, 2));
  console.log(analyzed === 1 ? 'PASS: dedupe (3 trùng → analyzed=1)' : `FAIL: analyzed=${analyzed}`);
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

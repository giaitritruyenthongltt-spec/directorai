/** B2 — render bgm:strip với cleanup_stems = argv[3] ('1' = dọn). */
import WebSocket from 'ws';
const VIDEO = process.argv[2];
const CLEANUP = process.argv[3] === '1';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p) {
  const i = id++;
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout')), 200000);
    const h = (d) => {
      let x;
      try {
        x = JSON.parse(d);
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
  const r = await call('recut.batch.process', {
    videoPath: VIDEO,
    outPath: VIDEO.replace(/\.[^.]+$/, '_b2.mp4'),
    recipe: { bgm: 'strip', cleanup_stems: CLEANUP },
  });
  console.log(`cleanup=${CLEANUP} ok=${r.ok} applied=${(r.applied || []).join(',')}`);
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

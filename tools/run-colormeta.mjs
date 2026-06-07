/** Verify A5 (màu hue/contrast) + A7 (strip metadata + title) qua recut.batch.process. */
import WebSocket from 'ws';
const VIDEO = process.argv[2];
const OUT = VIDEO.replace(/\.[^.]+$/, '_cm.mp4');
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p = {}, t = 200000) {
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
  const r = await call('recut.batch.process', {
    videoPath: VIDEO,
    outPath: OUT,
    recipe: {
      flip: false,
      contrast: 1.06,
      hue_deg: 12,
      grain: 4,
      bgm: 'keep',
      strip_metadata: true,
      title: 'NEW_RECUT_TITLE',
    },
  });
  console.log('ok:', r.ok, '| applied:', (r.applied || []).join(','));
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

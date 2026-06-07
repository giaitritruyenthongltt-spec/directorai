/** Test recut.separateAudio qua WS (panel→server→sidecar→Demucs GPU). */
import WebSocket from 'ws';
const VIDEO = process.argv[2] ?? 'E:/T11/_audio_test.mp4';
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
    const to = setTimeout(() => {
      ws.off('message', h);
      rej(new Error('timeout'));
    }, t);
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
  const r = await call('recut.separateAudio', { videoPath: VIDEO, mode: 'vocals' });
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

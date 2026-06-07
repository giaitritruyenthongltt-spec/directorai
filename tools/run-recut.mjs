/** Gọi recut.detectScenes (R1) + tuỳ chọn recut.applyDedup (R2). */
import WebSocket from 'ws';
const VIDEO = process.argv[2] ?? 'E:\\T11\\_recut_test.mp4';
const ACTION = process.argv[3] ?? 'detect'; // detect | dedup
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
  setTimeout(() => rej(new Error('timeout')), 5000);
});
function call(m, p = {}, t = 400000) {
  const myId = id++;
  return new Promise((res, rej) => {
    const to = setTimeout(() => {
      ws.off('message', h);
      rej(new Error('timeout ' + m));
    }, t);
    const h = (raw) => {
      let x;
      try {
        x = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (x.id !== myId) return;
      ws.off('message', h);
      clearTimeout(to);
      x.error ? rej(new Error(x.error.message)) : res(x.result);
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: myId, method: m, params: p }));
  });
}
try {
  const det = await call('recut.detectScenes', { videoPath: VIDEO });
  console.log('[detectScenes]', JSON.stringify({ ...det, scenes: `[${det.sceneCount} cảnh]` }, null, 2));
  if (ACTION === 'dedup' && det.sequenceId) {
    const r = await call('recut.applyDedup', {
      sequenceId: det.sequenceId,
      options: { reorder: true, trimHeadSec: 0.1, trimTailSec: 0.1 },
    });
    console.log('[applyDedup]', JSON.stringify(r, null, 2));
  }
} catch (e) {
  console.error('ERR:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

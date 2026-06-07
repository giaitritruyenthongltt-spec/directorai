/** A3 — detect + group + semantic labels. argv[2]=video. In ra nhãn từng nhóm. */
import WebSocket from 'ws';
const VIDEO = process.argv[2] ?? 'E:/T11/8.mp4';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p, t = 180000) {
  const i = id++;
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout ' + m)), t);
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
  const r = await call('recut.detectScenesSidecar', {
    videoPath: VIDEO,
    detector: 'adaptive',
    thumbnails: false,
    group: true,
    semantic: true,
  });
  console.log(`scenes=${r.sceneCount} groups=${r.groups.length}`);
  const labeled = r.groups.filter((g) => g.label).length;
  for (const g of r.groups) {
    console.log(
      `  Cảnh ${g.index + 1} (${g.shotCount} shot) @${g.startSec.toFixed(1)}s → ${g.label ?? '(không nhãn)'}`
    );
  }
  console.log(labeled > 0 ? `PASS: ${labeled}/${r.groups.length} nhóm có nhãn AI` : 'WARN: 0 nhãn');
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

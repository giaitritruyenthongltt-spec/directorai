/** Smoke recut.batch.folder (server-driven batch + progress + cancel). */
import WebSocket from 'ws';
const FOLDER = process.argv[2] ?? 'C:\\Users\\KENLY\\AppData\\Local\\Temp\\recut_batch_test';
const RECURSIVE = process.argv[3] === 'r' || process.argv[3] === 'true';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
// In tiến độ (progress notification, không có id).
ws.on('message', (raw) => {
  let x;
  try {
    x = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (x.method === 'progress' && x.params) {
    const p = x.params;
    if (p.kind === 'update') console.log(`  …tiến độ ${p.done}/${p.total} ${p.label ?? ''}`);
    else if (p.kind === 'start') console.log(`  …bắt đầu op ${p.opId}`);
    else if (p.kind === 'end') console.log(`  …kết thúc: ${p.status}`);
  }
});
function call(m, p = {}, t = 600000) {
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
  const r = await call('recut.batch.folder', {
    folder: FOLDER,
    recursive: RECURSIVE,
    skipExisting: false,
    recipe: { flip: true, crop_pct: 3, grain: 6, saturation: 1.08, bgm: 'keep' },
  });
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

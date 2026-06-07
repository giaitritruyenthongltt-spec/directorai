/** Smoke recut.buildCutListFcpxml (cut-list adaptive → FCPXML editable). */
import WebSocket from 'ws';
const VIDEO = process.argv[2] ?? 'C:\\Users\\KENLY\\Downloads\\KIENKH_TAP2.mp4';
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
import { readFileSync } from 'node:fs';
try {
  // Không truyền scenes → server tự dò adaptive rồi dựng FCPXML.
  const r = await call('recut.buildCutListFcpxml', { videoPath: VIDEO });
  console.log(JSON.stringify(r, null, 2));
  // Đếm số <asset-clip>/<clip> trong file để xác nhận N cảnh.
  const xml = readFileSync(r.path, 'utf-8');
  const clipTags = (xml.match(/<(asset-clip|clip)\b/g) || []).length;
  const assets = (xml.match(/<asset\b/g) || []).length;
  console.log(`XML: ${clipTags} clip-tags, ${assets} asset(s), ${xml.length} bytes`);
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

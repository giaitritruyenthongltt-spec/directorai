/**
 * Chạy _debug.importProbe (kênh B) — thử các signature importSequences/importFiles
 * để tìm đường import FCPXML → sequence. In kết quả + xác nhận WS sống sau reload.
 *   node tools/run-import-probe.mjs [fcpxmlPath]
 */
import WebSocket from 'ws';
const FCPXML = process.argv[2] ?? 'E:\\T11\\_recut_test_recut.fcpxml';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
  setTimeout(() => rej(new Error('connect timeout')), 5000);
});
function call(method, params = {}, t = 60000) {
  const myId = id++;
  return new Promise((res, rej) => {
    const to = setTimeout(() => {
      ws.off('message', h);
      rej(new Error('timeout ' + method));
    }, t);
    const h = (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.id !== myId) return;
      ws.off('message', h);
      clearTimeout(to);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }));
  });
}
try {
  // 1. WS alive? (panel re-registered after reload)
  const seqs = await call('project.listSequences', {});
  console.log(`[ws-alive] sequences=${(seqs ?? []).length}: ${(seqs ?? []).map((s) => s.name).join(', ')}`);
  // 2. import probe
  console.log(`[probe] _debug.importProbe path=${FCPXML} ...`);
  const r = await call('_debug.importProbe', { path: FCPXML }, 90000);
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error('ERR:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

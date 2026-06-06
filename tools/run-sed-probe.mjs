/**
 * Chạy _debug.sedProbe — validate native Scene Edit Detection end-to-end.
 *   node tools/run-sed-probe.mjs [videoPath]
 */
import WebSocket from 'ws';
const VIDEO = process.argv[2] ?? 'E:\\T11\\_recut_test.mp4';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
  setTimeout(() => rej(new Error('connect timeout')), 5000);
});
function call(method, params = {}, t = 120000) {
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
  const seqs = await call('project.listSequences', {});
  console.log(`[ws-alive] sequences=${(seqs ?? []).length}: ${(seqs ?? []).map((s) => s.name).join(', ')}`);
  console.log(`[sed] _debug.sedProbe video=${VIDEO} ...`);
  const r = await call('_debug.sedProbe', { path: VIDEO }, 150000);
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error('ERR:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

/**
 * Đếm sequence hiện có trong project (qua WS → adapter thật).
 * Dùng để so trước/sau khi import FCPXML.
 *   node tools/seq-count.mjs
 */
import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
  setTimeout(() => rej(new Error('timeout')), 5000);
});
function call(method, params = {}, t = 20000) {
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
  const arr = Array.isArray(seqs) ? seqs : [];
  console.log(`SEQCOUNT=${arr.length}`);
  for (const s of arr) console.log(`  - ${s.name ?? s.id ?? JSON.stringify(s).slice(0, 60)}`);
} catch (e) {
  console.error('ERR:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

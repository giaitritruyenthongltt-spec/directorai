/** Chạy _debug.spikeProbe (S1 màu-persist · S5 Transform-Scale · S4 audio-insert API). */
import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
  setTimeout(() => rej(new Error('timeout')), 5000);
});
function call(m, p = {}, t = 90000) {
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
  const r = await call('_debug.spikeProbe', {}, 120000);
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error('ERR:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

/** A2 — gợi ý thứ tự clip theo mạch phim. In ra thứ tự + lý do. */
import WebSocket from 'ws';
const CLIPS = process.argv.slice(2);
const clips = CLIPS.length ? CLIPS : ['2', '3', '6', '7', '8'].map((n) => `E:/T11/${n}.mp4`);
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p, t = 600000) {
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
  const r = await call('context.suggestOrder', {
    clipPaths: clips,
    goal: 'Trailer Nerf action 60s: mở nhanh, cao trào giữa, kết bằng pha đẹp nhất',
  });
  console.log(`strategy: ${r.strategy}`);
  console.log(`understood: ${r.understood}/${clips.length}`);
  for (const o of r.order) {
    console.log(
      `  #${o.position + 1} [${o.phaseVi}] ${o.path.split(/[\\/]/).pop()} (action ${o.actionLevel}) — ${o.reason}`
    );
  }
  const ok = r.order.length === clips.length;
  console.log(ok ? `PASS: sắp ${r.order.length} clip theo mạch phim` : 'FAIL');
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

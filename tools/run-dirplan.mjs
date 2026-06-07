/** B3 — director.plan phải trả planId (draft) → refine được TRƯỚC execute. */
import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p) {
  const i = id++;
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('timeout')), 120000);
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
  const plan = await call('director.plan', {
    goal: 'Cắt bỏ khoảng lặng audio trên timeline',
    persona: 'action',
  });
  console.log('planId:', plan.planId, '| steps:', (plan.steps || []).length);
  console.log(
    plan.planId && String(plan.planId).startsWith('draft_')
      ? 'PASS: director.plan trả draft planId (refine-trước-execute OK)'
      : 'FAIL: thiếu draft planId'
  );
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

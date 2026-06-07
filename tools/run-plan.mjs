/** C3 (lõi) — verify Gemini editorial pipeline LIVE: context.buildEditPlan trên file thật. */
import WebSocket from 'ws';
const VIDEO = process.argv[2] ?? 'C:\\Users\\KENLY\\Downloads\\KIENKH_TAP2.mp4';
const GOAL = process.argv[3] ?? 'Dựng recap action Nerf ~60 giây, giữ pha gay cấn nhất';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p = {}, t = 300000) {
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
  const r = await call('context.buildEditPlan', { clipPaths: [VIDEO], goal: GOAL });
  const p = r.edit_plan || {};
  console.log(
    JSON.stringify(
      {
        clips_understood: r.clips_understood,
        clips_failed: r.clips_failed,
        strategy: (p.strategy || '').slice(0, 120),
        steps: (p.steps || []).length,
        chapters: (p.chapters || []).length,
        out_of_scope: (p.out_of_scope || []).length,
        truncated: !!p.truncated,
      },
      null,
      2
    )
  );
  console.log((p.steps || []).length > 0 ? 'PASS: Gemini editorial pipeline live OK' : 'WARN: 0 steps');
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

/**
 * Chứng minh LOG MUTATION mới (P1): 1 rename THẬT trên timeline + tự hoàn tác,
 * rồi kỳ vọng ops.log có event `mutate method=timeline.renameClip adapter=real`.
 *   node tools/test-mutate-log.mjs
 */
import WebSocket from 'ws';
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
const TEST = '__OBS_LOG_TEST__';
try {
  const r0 = await call('context.activeSequenceClips', {});
  const clips = Array.isArray(r0) ? r0 : (r0?.clips ?? []);
  const vid = clips.find((c) => c.kind === 'video');
  if (!vid) throw new Error('no video clip');
  const orig = vid.name;
  console.log(`[target] clipId=${vid.id} name="${orig}"`);
  console.log('[mutate] rename → TEST (THẬT)');
  await call('timeline.renameClip', { clipId: vid.id, newName: TEST });
  // re-resolve id mới (synthetic id đổi sau rename) để hoàn tác
  const r1 = await call('context.activeSequenceClips', {});
  const after = Array.isArray(r1) ? r1 : (r1?.clips ?? []);
  const renamed = after.find((c) => c.name === TEST && c.kind === 'video');
  console.log(`[verify] có ${after.filter((c) => c.name === TEST).length} clip tên TEST`);
  if (renamed) {
    console.log('[revert] rename về tên gốc');
    await call('timeline.renameClip', { clipId: renamed.id, newName: orig });
  }
  console.log('✓ xong — kiểm ops.log có 2 dòng mutate adapter=real');
} catch (e) {
  console.error('ERR:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

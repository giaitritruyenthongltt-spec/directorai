/** P0 — dump _debug.introspect, lưu JSON + lọc method liên quan adjustment/insert. */
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p = {}, t = 60000) {
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
  const r = await call('_debug.introspect');
  writeFileSync('D:/CODE AI/PREMIRE/.secrets/introspect.json', JSON.stringify(r, null, 2));
  const flat = JSON.stringify(r).toLowerCase();
  const KW = ['adjust', 'insert', 'overwrite', 'append', 'createclip', 'import', 'createbin', 'newsequence', 'transparent', 'matte', 'synthetic', 'createnewsequence', 'projectitem'];
  console.log('keys:', Object.keys(r).join(', '));
  console.log('note:', r.note ?? '(none)');
  for (const lvl of ['module', 'project', 'sequence', 'track', 'trackItem', 'projectItem']) {
    const arr = r[lvl];
    if (Array.isArray(arr)) {
      const hits = arr.filter((m) => KW.some((k) => String(m).toLowerCase().includes(k)));
      console.log(`\n[${lvl}] ${arr.length} members; matches:`, hits.length ? hits.join(', ') : '—');
    }
    const act = r[lvl + 'Actions'];
    if (Array.isArray(act) && act.length) {
      const ah = act.filter((m) => KW.some((k) => String(m).toLowerCase().includes(k)));
      console.log(`[${lvl}Actions]`, ah.length ? ah.join(', ') : `(${act.length} factories, none match)`);
    }
  }
  console.log('\nfull dump -> .secrets/introspect.json');
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

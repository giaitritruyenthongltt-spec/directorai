/**
 * Probe (kênh B — WS/UXP): dò API import của Premiere 26 để tìm đường
 * import FCPXML → sequence (thay cho importFiles vốn không tạo sequence).
 * Gọi _debug.introspect (handler sẵn có) rồi lọc member theo từ khoá.
 *
 *   node tools/probe-import.mjs
 */
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
  setTimeout(() => rej(new Error('connect timeout')), 5000);
});

function call(method, params = {}, timeoutMs = 30000) {
  const myId = id++;
  return new Promise((res, rej) => {
    const t = setTimeout(() => {
      ws.off('message', h);
      rej(new Error(`timeout @ ${method}`));
    }, timeoutMs);
    const h = (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.id !== myId) return;
      ws.off('message', h);
      clearTimeout(t);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }));
  });
}

const KW = /import|sequence|fcp|xml|project|media|ingest|interpret|open/i;
const pick = (arr) => (Array.isArray(arr) ? arr.filter((m) => KW.test(String(m))) : arr);

try {
  const r = await call('_debug.introspect', {});
  console.log('=== MODULE actions ===');
  console.log(r.moduleActions);
  console.log('\n=== MODULE members (import/seq/fcp) ===');
  console.log(pick(r.module));
  console.log('\n=== PROJECT members (import/seq/fcp) ===');
  console.log(pick(r.project));
  console.log('\n=== PROJECT actions ===');
  console.log(r.projectActions);
  console.log('\n=== SEQUENCE members (import/seq/fcp) ===');
  console.log(pick(r.sequence));
  // các static class có thể chứa importer
  for (const k of Object.keys(r)) {
    if (/static_/.test(k) && Array.isArray(r[k])) {
      const hits = pick(r[k]);
      if (hits && hits.length) console.log(`\n=== ${k} (import/seq) ===\n`, hits);
    }
  }
  console.log('\n[note] proj=', r.projItemName ?? r.note ?? '(active project present)');
} catch (e) {
  console.error('PROBE ERR:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

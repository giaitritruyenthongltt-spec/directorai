/** Smoke recut.detectScenesSidecar (PySceneDetect qua server composite). */
import WebSocket from 'ws';
const VIDEO = process.argv[2] ?? 'C:\\Users\\KENLY\\Downloads\\KIENKH_TAP2.mp4';
const DET = process.argv[3] ?? 'adaptive';
const ws = new WebSocket('ws://127.0.0.1:7778');
let id = 1;
await new Promise((r, j) => {
  ws.once('open', r);
  ws.once('error', j);
  setTimeout(() => j(new Error('connect timeout')), 5000);
});
function call(m, p = {}, t = 200000) {
  const i = id++;
  return new Promise((res, rej) => {
    const to = setTimeout(() => {
      ws.off('message', h);
      rej(new Error('timeout'));
    }, t);
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
  const r = await call('recut.detectScenesSidecar', {
    videoPath: VIDEO,
    detector: DET,
    minSceneLenSec: 1.0,
    thumbnails: true,
    group: true,
  });
  const withThumb = (r.scenes ?? []).filter((s) => s.thumb).length;
  console.log(
    JSON.stringify(
      {
        detector: r.detector,
        fps: r.fps,
        sceneCount: r.sceneCount,
        thumbsPresent: withThumb,
        groupCount: (r.groups ?? []).length,
        groupsSample: (r.groups ?? [])
          .slice(0, 5)
          .map((g) => ({ i: g.index, shots: g.shotCount, dur: +g.durationSec.toFixed(1) })),
        first3: (r.scenes ?? [])
          .slice(0, 3)
          .map((s) => ({ i: s.index, at: +s.startSec.toFixed(1), dur: +s.durationSec.toFixed(1), thumb: s.thumb ? `${(s.thumb.length / 1024).toFixed(1)}KB` : null })),
      },
      null,
      2
    )
  );
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
}

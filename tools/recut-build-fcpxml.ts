/**
 * Recut MVP (validate) — video → /scenes (sidecar) → FCPXML cắt-cảnh.
 *
 * Đây là LÕI backend của tab "Tách & Tái dựng": phát hiện cảnh rồi sinh 1
 * FCPXML mỗi cảnh = 1 clip (in/out của video gốc) → Import vào Premiere ra
 * sequence đã cắt cảnh, editable.
 *
 *   pnpm exec tsx tools/recut-build-fcpxml.ts "E:/T11/_recut_test.mp4"
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildContiguousTimeline, buildFcpxml } from '../packages/fcpxml/src/index.js';

/** Độ dài video (giây) qua ffprobe — để asset FCPXML khai báo ĐÚNG length. */
function probeDurationSec(path: string): number {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path],
      { encoding: 'utf8' }
    );
    const n = parseFloat(out.trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

interface Scene {
  index: number;
  start: number;
  end: number;
  duration: number;
}

const video = process.argv[2];
if (!video) {
  console.error('Usage: tsx tools/recut-build-fcpxml.ts <video-path> [out.fcpxml]');
  process.exit(1);
}
const out = process.argv[3] ?? video.replace(/\.[^.]+$/, '') + '_recut.fcpxml';
const SIDECAR = process.env.CONTEXT_ENGINE_URL ?? 'http://127.0.0.1:8000';

const res = await fetch(`${SIDECAR}/scenes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ media_path: video, threshold: 27, min_scene_len_sec: 1.0 }),
});
if (!res.ok) {
  console.error(`/scenes HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const data = (await res.json()) as { scenes: Scene[] };
let scenes = data.scenes;
if (!scenes.length) {
  // Video 1-shot (không cắt cảnh) → coi cả video là 1 cảnh.
  console.warn('[recut] 0 cảnh phát hiện → dùng cả video làm 1 cảnh');
  scenes = [{ index: 0, start: 0, end: 0, duration: 0 }];
}

const clips = scenes.map((s) => ({
  assetPath: video,
  name: `Cảnh ${s.index + 1}`,
  durationSec: s.duration > 0 ? s.duration : 9999, // 9999 = cả phần còn lại
  sourceInSec: s.start,
}));

const baseName = video.split(/[\\/]/).pop() ?? 'recut';
const tl = buildContiguousTimeline(`Recut — ${baseName}`, clips, {
  fps: 30,
  width: 1280,
  height: 720,
});
// QUAN TRỌNG: asset phải khai báo độ dài CẢ video (mọi cảnh tham chiếu vào nó),
// không thì Premiere cắt sai khi sourceIn > độ dài cảnh đầu.
const assetDur = probeDurationSec(video) || scenes[scenes.length - 1].end || 0;
for (const c of tl.clips) c.assetDurationSec = assetDur;
const xml = buildFcpxml(tl);
writeFileSync(out, xml, 'utf8');

console.log(`✓ ${scenes.length} cảnh → ${out}`);
console.log(`  tổng thời lượng ~${scenes.reduce((a, s) => a + s.duration, 0).toFixed(1)}s`);
console.log(`  Import vào Premiere: File → Import → chọn file .fcpxml`);

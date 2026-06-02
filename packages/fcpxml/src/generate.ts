/**
 * @directorai/fcpxml — Sinh FCPXML từ FcpTimeline.
 *
 * Hỗ trợ: dựng spine (auto-build/insert), in/out (split/trim), speed
 * (timeMap), marker. Xuất chuỗi FCPXML hợp lệ (v1.9) để Import vào Premiere.
 */

import type { FcpTimeline, FcpClip, FcpMarker } from './types.js';

/**
 * Thời lượng 1 khung dạng hữu tỉ NGUYÊN (FCPXML yêu cầu num/den nguyên).
 * NTSC (29.97/59.94/23.976) → 1001/timebase; còn lại → 1/fps.
 */
export function frameDuration(fps: number): { num: number; den: number } {
  const f = Math.round(fps * 1000) / 1000;
  if (f === 29.97) return { num: 1001, den: 30000 };
  if (f === 59.94) return { num: 1001, den: 60000 };
  if (f === 23.976) return { num: 1001, den: 24000 };
  if (f === 47.952) return { num: 1001, den: 48000 };
  const fi = Math.round(fps);
  return { num: 1, den: fi }; // 24/25/30/50/60 integer
}

/** Đổi giây → thời gian hữu tỉ FCPXML "N/Ds" NGUYÊN theo fps (= frames × frameDur). */
export function secondsToRational(sec: number, fps: number): string {
  const fd = frameDuration(fps);
  const frames = Math.round(sec * (fd.den / fd.num)); // số khung
  return `${frames * fd.num}/${fd.den}s`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Đường dẫn file → URI file:// (Windows: E:\a\b.mp4 → file:///E:/a/b.mp4). */
export function pathToFileUri(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const withSlash = /^[a-zA-Z]:/.test(norm) ? `/${norm}` : norm;
  return `file://${encodeURI(withSlash)}`;
}

function markerXml(m: FcpMarker, fps: number): string {
  return `          <marker start="${secondsToRational(m.startSec, fps)}" duration="${secondsToRational(1 / fps, fps)}" value="${xmlEscape(m.name)}"/>`;
}

function clipXml(clip: FcpClip, assetId: string, fps: number): string {
  const offset = secondsToRational(clip.timelineStartSec, fps);
  const start = secondsToRational(clip.sourceInSec, fps);
  const duration = secondsToRational(clip.durationSec, fps);
  const lines: string[] = [
    `        <asset-clip ref="${assetId}" offset="${offset}" name="${xmlEscape(clip.name)}" start="${start}" duration="${duration}" tcFormat="NDF">`,
  ];
  // Speed (retime) — timeMap: thời gian timeline 0→duration ánh xạ source
  // sourceIn → sourceIn + (duration*speed). speed=0.5 (slow-mo) tiêu thụ ÍT
  // source hơn; speed=2 (nhanh) tiêu thụ NHIỀU hơn (đúng nghĩa hệ số phát).
  if (clip.speed && clip.speed !== 1) {
    const srcLen = clip.durationSec * clip.speed;
    lines.push(`          <timeMap>`);
    lines.push(
      `            <timept time="0s" value="${secondsToRational(clip.sourceInSec, fps)}" interp="linear"/>`
    );
    lines.push(
      `            <timept time="${duration}" value="${secondsToRational(clip.sourceInSec + srcLen, fps)}" interp="linear"/>`
    );
    lines.push(`          </timeMap>`);
  }
  for (const m of clip.markers ?? []) lines.push(markerXml(m, fps));
  lines.push(`        </asset-clip>`);
  return lines.join('\n');
}

/**
 * Sinh FCPXML hợp lệ từ timeline. Mỗi asset (file gốc) khai báo 1 lần
 * trong <resources>; clip tham chiếu qua ref.
 */
export function buildFcpxml(timeline: FcpTimeline): string {
  const fps = timeline.fps;
  const fdRat = frameDuration(fps);
  const fd = `${fdRat.num}/${fdRat.den}s`;

  // Gom asset theo path (1 asset/file dù dùng nhiều lần).
  const assetIdByPath = new Map<string, string>();
  const assets: string[] = [];
  let ai = 0;
  for (const c of timeline.clips) {
    if (assetIdByPath.has(c.assetPath)) continue;
    const id = `a${++ai}`;
    assetIdByPath.set(c.assetPath, id);
    const dur = secondsToRational(c.assetDurationSec ?? Math.max(c.durationSec, 1), fps);
    assets.push(
      `    <asset id="${id}" name="${xmlEscape(c.name)}" src="${pathToFileUri(c.assetPath)}" ` +
        `hasVideo="1" hasAudio="${c.hasAudio === false ? 0 : 1}" format="r1" duration="${dur}" start="0s"/>`
    );
  }

  const totalDur = timeline.clips.reduce(
    (m, c) => Math.max(m, c.timelineStartSec + c.durationSec),
    0
  );

  const spine = timeline.clips
    .map((c) => clipXml(c, assetIdByPath.get(c.assetPath)!, fps))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat" frameDuration="${fd}" width="${timeline.width}" height="${timeline.height}"/>
${assets.join('\n')}
  </resources>
  <library>
    <event name="DirectorAI">
      <project name="${xmlEscape(timeline.name)}">
        <sequence format="r1" duration="${secondsToRational(totalDur, fps)}" tcFormat="NDF">
          <spine>
${spine}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

/**
 * C5 — Producer: dựng timeline auto-build từ danh sách clip theo thứ tự,
 * dán liền nhau (contiguous). Dùng cho use case "dựng từ đầu".
 */
export function buildContiguousTimeline(
  name: string,
  clips: {
    assetPath: string;
    name: string;
    durationSec: number;
    sourceInSec?: number;
    speed?: number;
  }[],
  opts: { fps?: number; width?: number; height?: number } = {}
): FcpTimeline {
  const fps = opts.fps ?? 30;
  let cursor = 0;
  const out: FcpClip[] = clips.map((c) => {
    const clip: FcpClip = {
      assetPath: c.assetPath,
      name: c.name,
      timelineStartSec: cursor,
      sourceInSec: c.sourceInSec ?? 0,
      durationSec: c.durationSec,
      speed: c.speed,
    };
    cursor += c.durationSec;
    return clip;
  });
  return { name, fps, width: opts.width ?? 1920, height: opts.height ?? 1080, clips: out };
}

/** Tiện ích: tách 1 clip thành 2 tại mốc giây (split). Trả 2 FcpClip. */
export function splitClip(clip: FcpClip, atSec: number): [FcpClip, FcpClip] {
  const a: FcpClip = { ...clip, durationSec: atSec, name: `${clip.name}_a` };
  const b: FcpClip = {
    ...clip,
    name: `${clip.name}_b`,
    timelineStartSec: clip.timelineStartSec + atSec,
    sourceInSec: clip.sourceInSec + atSec,
    durationSec: clip.durationSec - atSec,
  };
  return [a, b];
}

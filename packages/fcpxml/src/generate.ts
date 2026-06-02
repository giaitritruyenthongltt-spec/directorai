/**
 * @directorai/fcpxml — Sinh FCPXML từ FcpTimeline.
 *
 * Hỗ trợ: dựng spine (auto-build/insert), in/out (split/trim), speed
 * (timeMap), marker. Xuất chuỗi FCPXML hợp lệ (v1.9) để Import vào Premiere.
 */

import type { FcpTimeline, FcpClip, FcpMarker } from './types.js';

/** Đổi giây → thời gian hữu tỉ FCPXML "N/Ds" theo fps (khung). */
export function secondsToRational(sec: number, fps: number): string {
  const frames = Math.round(sec * fps);
  return `${frames}/${fps}s`;
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
  // Speed (retime) — timeMap: 0 → start, durationSec → start + sourceLen*speed.
  if (clip.speed && clip.speed !== 1) {
    const srcLen = clip.durationSec * clip.speed; // độ dài nguồn tiêu thụ
    lines.push(`          <timeMap>`);
    lines.push(
      `            <timept time="0s" value="${secondsToRational(clip.sourceInSec, fps)}" interp="smooth2"/>`
    );
    lines.push(
      `            <timept time="${duration}" value="${secondsToRational(clip.sourceInSec + srcLen, fps)}" interp="smooth2"/>`
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
  const fd = secondsToRational(1 / fps, fps);

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

import {
  type Clip,
  type Effect,
  type Marker,
  type Sequence,
  type Track,
  type Seconds,
  seconds,
  FPS_30,
} from '@directorai/core';
import type {
  PProMarker,
  PPro26Marker,
  PProProjectItem,
  PProSequence,
  PProTrack,
  PProTrackItem,
  TickTime,
  PProComponent,
  PProModule,
} from './uxp-ppro.js';

/**
 * PATH-FIX — Lấy đường dẫn media TUYỆT ĐỐI của 1 ProjectItem.
 * Nguyên nhân gốc bug "chỉ basename": `getMediaFilePath()` KHÔNG có trên
 * ProjectItem thô — nó nằm trên ClipProjectItem. Phải cast trước, rồi gọi
 * (đồng bộ, theo tài liệu Adobe). Trả '' nếu không lấy được (synthetic/offline).
 */
export function resolveMediaPath(projItem: PProProjectItem, ppro?: PProModule): string {
  // (1) Đường ĐÚNG: cast → ClipProjectItem.getMediaFilePath() (sync, full path).
  try {
    const clip = ppro?.ClipProjectItem?.cast?.(projItem);
    const v = clip?.getMediaFilePath?.();
    if (typeof v === 'string' && (v.includes('/') || v.includes('\\'))) return v;
  } catch {
    // ngã sang (2)
  }
  // (2) Dự phòng: 1 số bản có getMediaFilePath ngay trên item (sync/promise bỏ qua).
  try {
    const raw = (projItem as { getMediaFilePath?: () => unknown }).getMediaFilePath?.();
    if (typeof raw === 'string' && (raw.includes('/') || raw.includes('\\'))) return raw;
  } catch {
    // bỏ
  }
  return '';
}

export function tickToSeconds(t: TickTime): Seconds {
  return seconds(t.seconds);
}

const VIDEO_MEDIA = 'Video';

export async function translateTrack(
  track: PProTrack,
  index: number,
  ppro?: PProModule
): Promise<Track> {
  const [mediaType, muted, locked, items] = await Promise.all([
    track.getMediaType(),
    track.isMuted(),
    track.isLocked(),
    track.getTrackItems(1 /* ANY */, false),
  ]);

  // B2-FIX: getMediaType() khai báo string nhưng PPro26 trả SỐ (MediaType.VIDEO)
  // → so chuỗi 'Video' luôn false. So thêm với hằng số UXP thật.
  const videoConst = ppro?.MediaType?.VIDEO;
  const trackKind: Track['kind'] =
    mediaType === VIDEO_MEDIA || (videoConst !== undefined && (mediaType as unknown) === videoConst)
      ? 'video'
      : 'audio';
  const trackId = `${trackKind}-${index}`;
  const clips: Clip[] = [];
  for (const item of items) {
    clips.push(await translateTrackItem(item, trackId, trackKind, ppro));
  }

  return {
    id: trackId,
    index,
    kind: trackKind,
    name: track.name,
    muted,
    locked,
    clips,
  };
}

/**
 * Tolerate two failure modes for UXP API methods:
 *   - the method exists but the promise rejects
 *   - the method doesn't exist at all (TypeError synchronously)
 * Premiere 26's UXP surface changed in non-backwards-compatible ways from
 * the betas — some `.getX()` accessors became plain properties or vice versa.
 */
/**
 * Premiere 26's UXP API returns `guid` as a Guid object with a string-valued
 * property, not a plain string. Our IPC layer assumes string IDs, so flatten.
 */
export function stringifyGuid(guid: unknown): string {
  if (typeof guid === 'string') return guid;
  if (guid && typeof guid === 'object') {
    const g = guid as { asString?: () => string; toString?: () => string };
    if (typeof g.asString === 'function') return g.asString();
    if (typeof g.toString === 'function') {
      const s = g.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return String(guid);
}

async function safeAsync<T>(call: () => T | Promise<T>, fallback: () => T): Promise<T> {
  try {
    const v = call();
    if (v && typeof (v as Promise<T>).then === 'function') {
      return await (v as Promise<T>);
    }
    return v as T;
  } catch {
    return fallback();
  }
}

/**
 * Resolve a stable clip ID from a Premiere TrackItem.
 *
 * Premiere 2026 v26.0.0 exposes `nodeId` inconsistently — sometimes the
 * property is undefined, sometimes the API exposes a `getNodeId()` method,
 * and sometimes neither. We try every known shape and finally synthesize
 * an ID from track + start-tick + name, which is stable within a single
 * sequence and survives round-trips to `findTrackItem`.
 */
function resolveTrackItemId(
  item: PProTrackItem,
  trackId: string,
  startTick: string,
  name: string
): string {
  const direct = (item as { nodeId?: unknown }).nodeId;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const maybeFn = (item as { getNodeId?: () => string }).getNodeId;
  if (typeof maybeFn === 'function') {
    try {
      const id = maybeFn.call(item);
      if (typeof id === 'string' && id.length > 0) return id;
    } catch {
      // fall through
    }
  }
  // Synthetic — stable for the lifetime of the listing, unique within a track.
  return `${trackId}:${startTick}:${name}`;
}

export async function translateTrackItem(
  item: PProTrackItem,
  trackId: string,
  trackKind: Track['kind'],
  ppro?: PProModule
): Promise<Clip> {
  const [name, startT, endT, inT, outT, mediaType, projItem, disabled] = await Promise.all([
    safeAsync(
      () => item.getName(),
      () => item.name ?? 'Untitled'
    ),
    item.getStartTime(),
    item.getEndTime(),
    item.getInPoint(),
    item.getOutPoint(),
    safeAsync(
      () => item.getMediaType(),
      () => (trackKind === 'video' ? 'Video' : 'Audio')
    ),
    safeAsync(
      () => item.getProjectItem(),
      () => null
    ),
    // Trạng thái tắt THẬT (PPro26 có isDisabled()). Đọc được → enabled phản
    // ánh đúng (verify được disable/enable); lỗi → mặc định bật.
    safeAsync(
      () => item.isDisabled(),
      () => false
    ),
  ]);

  let sourcePath = '';
  let sourceDuration: Seconds = seconds(0);
  if (projItem) {
    // PATH-FIX — cast sang ClipProjectItem rồi getMediaFilePath() (đường ĐÚNG).
    // Nếu lấy được path tuyệt đối → dùng; nếu không (synthetic/offline) thì để
    // basename (folder-scan hoặc .prproj fallback sẽ map sau).
    sourcePath = resolveMediaPath(projItem, ppro) || projItem.name;
    try {
      sourceDuration = tickToSeconds(await projItem.getDuration());
    } catch {
      sourceDuration = seconds(0);
    }
  }

  // B2-FIX: Premiere 26 trả getMediaType() là SỐ (MediaType.VIDEO), KHÔNG phải
  // chuỗi 'Video' → so với 'Video' luôn false → MỌI clip thành 'audio'. trackKind
  // (từ getVideoTrack/getAudioTrack) là nguồn ĐÁNG TIN → ưu tiên; getMediaType
  // chỉ là fallback (mock trả 'Video').
  const kind: Clip['kind'] =
    trackKind === 'video' || trackKind === 'audio'
      ? trackKind
      : mediaType === VIDEO_MEDIA
        ? 'video'
        : 'audio';

  // Premiere 2026 sometimes returns undefined for `nodeId` on the readonly
  // property — try alternate accessors and finally fall back to a synthetic
  // ID that's stable for the lifetime of this listing.
  const id = resolveTrackItemId(item, trackId, String(startT.ticks ?? ''), name);

  return {
    id,
    name,
    kind,
    trackId,
    timelineRange: { start: tickToSeconds(startT), end: tickToSeconds(endT) },
    sourceRange: { start: tickToSeconds(inT), end: tickToSeconds(outT) },
    source: {
      path: sourcePath,
      duration: sourceDuration,
      hasVideo: kind === 'video',
      hasAudio: kind === 'audio',
    },
    effects: [],
    enabled: !disabled,
  };
}

export async function translateComponent(c: PProComponent): Promise<Effect> {
  // PPro26: component dùng getMatchName()/getDisplayName()/getParamCount()/
  // getParam(i)/param.getStartValue() — KHÔNG có .matchName/.getParams() (đường
  // cũ → undefined.toLowerCase() crash).
  const cc = c as unknown as {
    getMatchName?: () => Promise<string>;
    getDisplayName?: () => Promise<string>;
    matchName?: string;
    displayName?: string;
    getParamCount?: () => Promise<number>;
    getParam?: (i: number) => Promise<unknown>;
  };
  const matchName = (await cc.getMatchName?.()) ?? cc.matchName ?? '';
  const displayName = (await cc.getDisplayName?.()) ?? cc.displayName ?? matchName;

  const params: { name: string; value: number | string | boolean }[] = [];
  try {
    const pc = (await cc.getParamCount?.()) ?? 0;
    for (let i = 0; i < pc; i++) {
      try {
        const p = (await cc.getParam?.(i)) as {
          displayName?: string;
          getStartValue?: () => Promise<number | string | boolean> | number | string | boolean;
        } | null;
        if (!p?.getStartValue) continue;
        const v = await p.getStartValue();
        if (v !== undefined && v !== null)
          params.push({ name: p.displayName ?? `#${i}`, value: v });
      } catch {
        // skip unreadable param
      }
    }
  } catch {
    // no params
  }

  const m = matchName.toLowerCase();
  let kind: Effect['kind'] = 'video';
  if (m.includes('audio')) kind = 'audio';
  else if (m.includes('lumetri')) kind = 'color';
  else if (m.includes('text') || m.includes('title')) kind = 'text';

  return {
    id: `${matchName}-${Math.random().toString(36).slice(2, 8)}`,
    matchName,
    displayName,
    kind,
    enabled: true,
    params,
  };
}

export async function translateMarker(m: PProMarker): Promise<Marker> {
  const [start, duration] = await Promise.all([m.getStartTime(), m.getDuration()]);
  const kindMap: Record<string, Marker['kind']> = {
    Comment: 'comment',
    Chapter: 'chapter',
    Segmentation: 'segmentation',
    WebLink: 'web',
  };
  return {
    id: stringifyGuid(m.guid),
    time: tickToSeconds(start),
    duration: tickToSeconds(duration),
    kind: kindMap[m.type] ?? 'comment',
    name: m.name,
    comment: m.comment,
    color: m.color || '#ffcc00',
  };
}

/** PPro26 — id tổng hợp marker (không có guid ổn định) = mk:<ms>:<name>. */
export function markerSyntheticId(timeSec: number, name: string): string {
  return `mk:${Math.round(timeSec * 1000)}:${name}`;
}

/** PPro26 — marker dùng getStart/getName/getType/getComments (action model). */
export async function translatePPro26Marker(m: PPro26Marker): Promise<Marker> {
  const [start, duration, name, type, comment] = await Promise.all([
    m.getStart(),
    m.getDuration(),
    safeAsync(
      () => m.getName(),
      () => ''
    ),
    safeAsync(
      () => m.getType(),
      () => 'Comment'
    ),
    safeAsync(
      () => m.getComments(),
      () => ''
    ),
  ]);
  const kindMap: Record<string, Marker['kind']> = {
    Comment: 'comment',
    Chapter: 'chapter',
    Segmentation: 'segmentation',
    WebLink: 'web',
  };
  const t = tickToSeconds(start);
  return {
    id: markerSyntheticId(t, name),
    time: t,
    duration: tickToSeconds(duration),
    kind: kindMap[type] ?? 'comment',
    name,
    comment,
    color: '#ffcc00',
  };
}

export async function translateSequence(seq: PProSequence, ppro?: PProModule): Promise<Sequence> {
  const [name, endTime, vCount, aCount, settings] = await Promise.all([
    safeAsync(
      () => seq.getName(),
      () => seq.name ?? 'Untitled'
    ),
    safeAsync(
      () => seq.getEndTime(),
      () => null
    ),
    safeAsync(
      () => seq.getVideoTrackCount(),
      () => 0
    ),
    safeAsync(
      () => seq.getAudioTrackCount(),
      () => 0
    ),
    safeAsync(
      () => seq.getSettings(),
      () => null
    ),
  ]);

  const tracks: Track[] = [];
  for (let i = 0; i < vCount; i++) {
    try {
      const t = await seq.getVideoTrack(i);
      tracks.push(await translateTrack(t, i, ppro));
    } catch {
      // skip missing track
    }
  }
  for (let i = 0; i < aCount; i++) {
    try {
      const t = await seq.getAudioTrack(i);
      tracks.push(await translateTrack(t, i, ppro));
    } catch {
      // skip missing track
    }
  }

  const markers: Marker[] = [];
  try {
    const ms = await seq.markers.getMarkers();
    for (const m of ms) markers.push(await translateMarker(m));
  } catch {
    // no markers or unavailable
  }

  const duration = endTime ? tickToSeconds(endTime) : seconds(0);
  // Settings shape varies across Premiere UXP API revisions — be defensive
  // about every field instead of assuming the whole object is well-formed.
  const sequenceSettings: Sequence['settings'] = {
    width: settings?.videoFrameWidth ?? 1920,
    height: settings?.videoFrameHeight ?? 1080,
    frameRate: settings?.videoFrameRate?.seconds
      ? { numerator: Math.round(1 / settings.videoFrameRate.seconds), denominator: 1 }
      : FPS_30,
    sampleRate: settings?.audioSampleRate ?? 48000,
  };

  return {
    id: stringifyGuid(seq.guid),
    name,
    duration,
    settings: sequenceSettings,
    tracks,
    markers,
  };
}

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
  PProProjectItem,
  PProSequence,
  PProTrack,
  PProTrackItem,
  TickTime,
  PProComponent,
} from './uxp-ppro.js';

export function tickToSeconds(t: TickTime): Seconds {
  return seconds(t.seconds);
}

const VIDEO_MEDIA = 'Video';

export async function translateTrack(track: PProTrack, index: number): Promise<Track> {
  const [mediaType, muted, locked, items] = await Promise.all([
    track.getMediaType(),
    track.isMuted(),
    track.isLocked(),
    track.getTrackItems(1 /* ANY */, false),
  ]);

  const trackKind: Track['kind'] = mediaType === VIDEO_MEDIA ? 'video' : 'audio';
  const trackId = `${trackKind}-${index}`;
  const clips: Clip[] = [];
  for (const item of items) {
    clips.push(await translateTrackItem(item, trackId, trackKind));
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
  trackKind: Track['kind']
): Promise<Clip> {
  const [name, startT, endT, inT, outT, mediaType, projItem] = await Promise.all([
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
  ]);

  let sourcePath = '';
  let sourceDuration: Seconds = seconds(0);
  if (projItem) {
    // O1/O2 — Premiere 26 sometimes returns empty string from
    // getMediaFilePath() or throws altogether. Try every known accessor
    // before falling back to bare name (which is useless for the sidecar
    // because it needs an absolute path to read frames from disk).
    const pi = projItem as PProProjectItem & {
      mediaFilePath?: string;
      filePath?: string;
      path?: string;
      getMediaPath?: () => Promise<string>;
      getFilePath?: () => Promise<string>;
    };
    const tryers: { label: string; fn: () => Promise<string> | string }[] = [
      { label: 'getMediaFilePath', fn: () => pi.getMediaFilePath() },
      { label: 'getMediaPath', fn: () => pi.getMediaPath?.() ?? '' },
      { label: 'getFilePath', fn: () => pi.getFilePath?.() ?? '' },
      { label: 'mediaFilePath', fn: () => pi.mediaFilePath ?? '' },
      { label: 'filePath', fn: () => pi.filePath ?? '' },
      { label: 'path', fn: () => pi.path ?? '' },
    ];
    for (const t of tryers) {
      try {
        const v = await t.fn();
        if (typeof v === 'string' && v.length > 0 && v !== projItem.name) {
          // Accept only an absolute-looking path (has separator).
          if (v.includes('/') || v.includes('\\')) {
            sourcePath = v;
            break;
          }
        }
      } catch {
        // try next accessor
      }
    }
    if (!sourcePath) {
      // Last-resort: bare name. Sidecar will fail on this — at least the
      // ops log will show the path was empty so we know why.
      sourcePath = projItem.name;
    }
    try {
      sourceDuration = tickToSeconds(await projItem.getDuration());
    } catch {
      sourceDuration = seconds(0);
    }
  }

  const kind: Clip['kind'] = mediaType === VIDEO_MEDIA ? 'video' : 'audio';

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
    enabled: true,
  };
}

export async function translateComponent(c: PProComponent): Promise<Effect> {
  const params: { name: string; value: number | string | boolean }[] = [];
  try {
    const ps = await c.getParams();
    for (const p of ps) {
      try {
        const v = await p.getValue();
        params.push({ name: p.displayName, value: v });
      } catch {
        // skip unreadable param
      }
    }
  } catch {
    // no params
  }

  const matchName = c.matchName;
  let kind: Effect['kind'] = 'video';
  if (matchName.toLowerCase().includes('audio')) kind = 'audio';
  else if (matchName.toLowerCase().includes('lumetri')) kind = 'color';
  else if (matchName.toLowerCase().includes('text') || matchName.toLowerCase().includes('title'))
    kind = 'text';

  return {
    id: `${matchName}-${Math.random().toString(36).slice(2, 8)}`,
    matchName,
    displayName: c.displayName,
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

export async function translateSequence(seq: PProSequence): Promise<Sequence> {
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
      tracks.push(await translateTrack(t, i));
    } catch {
      // skip missing track
    }
  }
  for (let i = 0; i < aCount; i++) {
    try {
      const t = await seq.getAudioTrack(i);
      tracks.push(await translateTrack(t, i));
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

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

export async function translateTrackItem(
  item: PProTrackItem,
  trackId: string,
  trackKind: Track['kind']
): Promise<Clip> {
  const [name, startT, endT, inT, outT, mediaType, projItem] = await Promise.all([
    item.getName().catch(() => item.name),
    item.getStartTime(),
    item.getEndTime(),
    item.getInPoint(),
    item.getOutPoint(),
    item.getMediaType().catch(() => (trackKind === 'video' ? 'Video' : 'Audio')),
    item.getProjectItem().catch(() => null),
  ]);

  let sourcePath = '';
  let sourceDuration: Seconds = seconds(0);
  if (projItem) {
    try {
      sourcePath = await projItem.getMediaFilePath();
    } catch {
      sourcePath = projItem.name;
    }
    try {
      sourceDuration = tickToSeconds(await projItem.getDuration());
    } catch {
      sourceDuration = seconds(0);
    }
  }

  const kind: Clip['kind'] = mediaType === VIDEO_MEDIA ? 'video' : 'audio';

  return {
    id: item.nodeId,
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
    id: m.guid,
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
    seq.getName().catch(() => seq.name),
    seq.getEndTime().catch(() => null),
    seq.getVideoTrackCount(),
    seq.getAudioTrackCount(),
    seq.getSettings().catch(() => null),
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
  const sequenceSettings: Sequence['settings'] = settings
    ? {
        width: settings.videoFrameWidth,
        height: settings.videoFrameHeight,
        frameRate: { numerator: Math.round(1 / settings.videoFrameRate.seconds), denominator: 1 },
        sampleRate: settings.audioSampleRate,
      }
    : { width: 1920, height: 1080, frameRate: FPS_30, sampleRate: 48000 };

  return {
    id: seq.guid,
    name,
    duration,
    settings: sequenceSettings,
    tracks,
    markers,
  };
}

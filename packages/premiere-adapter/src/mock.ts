import { NotFoundError, uniqueId } from '@directorai/shared';
import { getLumetriRecipe, LUMETRI_PRESET_KEYS } from '@directorai/effect-library';
import {
  type Project,
  type Sequence,
  type Clip,
  type Track,
  type Effect,
  type Marker,
  type Seconds,
  seconds,
  FPS_30,
} from '@directorai/core';
import type {
  IPremiereAdapter,
  ApplyEffectInput,
  AddMarkerInput,
  CutClipInput,
  TrimClipInput,
  MoveClipInput,
  ImportFileInput,
  ExportInput,
  KeyframeInput,
  ColorParamsInput,
  AudioGainInput,
  AudioFadeInput,
  TextOverlayInput,
  TransitionInput,
} from './types.js';

interface MutableSequence {
  id: string;
  name: string;
  duration: Seconds;
  settings: Sequence['settings'];
  tracks: MutableTrack[];
  markers: Marker[];
}

interface MutableTrack {
  id: string;
  index: number;
  kind: Track['kind'];
  name: string;
  muted: boolean;
  locked: boolean;
  clips: MutableClip[];
}

interface MutableClip {
  id: string;
  name: string;
  kind: Clip['kind'];
  trackId: string;
  timelineRange: { start: Seconds; end: Seconds };
  sourceRange: { start: Seconds; end: Seconds };
  source: Clip['source'];
  effects: Effect[];
  enabled: boolean;
}

export class MockPremiereAdapter implements IPremiereAdapter {
  readonly kind = 'mock' as const;

  private project: Project['metadata'] = {
    name: 'Mock Project',
    path: 'C:\\mock\\project.prproj',
    createdAt: new Date(0).toISOString(),
    modifiedAt: new Date().toISOString(),
  };

  private sequences = new Map<string, MutableSequence>();
  private activeSequenceId: string | null = null;
  private undoStack: { label: string; ops: number }[] = [];

  constructor(options?: { withSample?: boolean }) {
    if (options?.withSample ?? true) {
      this.seedSample();
    }
  }

  private seedSample(): void {
    const trackV1: MutableTrack = {
      id: 'track-v1',
      index: 0,
      kind: 'video',
      name: 'V1',
      muted: false,
      locked: false,
      clips: [],
    };
    const trackA1: MutableTrack = {
      id: 'track-a1',
      index: 0,
      kind: 'audio',
      name: 'A1',
      muted: false,
      locked: false,
      clips: [],
    };
    const sequence: MutableSequence = {
      id: 'seq-1',
      name: 'Sample Sequence',
      duration: seconds(60),
      settings: { width: 1920, height: 1080, frameRate: FPS_30, sampleRate: 48000 },
      tracks: [trackV1, trackA1],
      markers: [],
    };
    this.sequences.set(sequence.id, sequence);
    this.activeSequenceId = sequence.id;
  }

  private requireSequence(id: string): MutableSequence {
    const s = this.sequences.get(id);
    if (!s) throw new NotFoundError('Sequence', id);
    return s;
  }

  private findClip(clipId: string): {
    clip: MutableClip;
    track: MutableTrack;
    seq: MutableSequence;
  } {
    for (const seq of this.sequences.values()) {
      for (const track of seq.tracks) {
        const clip = track.clips.find((c) => c.id === clipId);
        if (clip) return { clip, track, seq };
      }
    }
    throw new NotFoundError('Clip', clipId);
  }

  private freezeSequence(s: MutableSequence): Sequence {
    return {
      id: s.id,
      name: s.name,
      duration: s.duration,
      settings: s.settings,
      tracks: s.tracks.map((t) => ({
        id: t.id,
        index: t.index,
        kind: t.kind,
        name: t.name,
        muted: t.muted,
        locked: t.locked,
        clips: t.clips.map((c) => this.freezeClip(c)),
      })),
      markers: s.markers,
    };
  }

  private freezeClip(c: MutableClip): Clip {
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      trackId: c.trackId,
      timelineRange: { start: c.timelineRange.start, end: c.timelineRange.end },
      sourceRange: { start: c.sourceRange.start, end: c.sourceRange.end },
      source: c.source,
      effects: [...c.effects],
      enabled: c.enabled,
    };
  }

  async getProject(): Promise<Project> {
    return {
      id: { value: 'mock-project', __brand: 'ProjectId' } as Project['id'],
      metadata: this.project,
      sequences: [...this.sequences.values()].map((s) => this.freezeSequence(s)),
      activeSequenceId: this.activeSequenceId,
    };
  }

  async listSequences(): Promise<readonly Sequence[]> {
    return [...this.sequences.values()].map((s) => this.freezeSequence(s));
  }

  async setActiveSequence(sequenceId: string): Promise<void> {
    this.requireSequence(sequenceId);
    this.activeSequenceId = sequenceId;
  }

  async getActiveSequence(): Promise<Sequence | null> {
    if (!this.activeSequenceId) return null;
    return this.freezeSequence(this.requireSequence(this.activeSequenceId));
  }

  async listClips(sequenceId: string): Promise<readonly Clip[]> {
    const s = this.requireSequence(sequenceId);
    return s.tracks.flatMap((t) => t.clips.map((c) => this.freezeClip(c)));
  }

  async getClip(clipId: string): Promise<Clip | null> {
    try {
      return this.freezeClip(this.findClip(clipId).clip);
    } catch {
      return null;
    }
  }

  async cutClip(input: CutClipInput): Promise<readonly Clip[]> {
    const { clip, track } = this.findClip(input.clipId);
    if (input.at <= clip.timelineRange.start || input.at >= clip.timelineRange.end) {
      throw new Error(`Cut point ${input.at}s is outside clip range`);
    }
    const splitOffset = input.at - clip.timelineRange.start;
    const second: MutableClip = {
      ...clip,
      id: uniqueId('clip'),
      timelineRange: { start: input.at as Seconds, end: clip.timelineRange.end },
      sourceRange: {
        start: (clip.sourceRange.start + splitOffset) as Seconds,
        end: clip.sourceRange.end,
      },
      effects: [...clip.effects],
    };
    clip.timelineRange = { start: clip.timelineRange.start, end: input.at as Seconds };
    clip.sourceRange = {
      start: clip.sourceRange.start,
      end: (clip.sourceRange.start + splitOffset) as Seconds,
    };
    track.clips.push(second);
    track.clips.sort((a, b) => a.timelineRange.start - b.timelineRange.start);
    return [this.freezeClip(clip), this.freezeClip(second)];
  }

  async trimClip(input: TrimClipInput): Promise<Clip> {
    const { clip } = this.findClip(input.clipId);
    clip.timelineRange = { start: input.newRange.start, end: input.newRange.end };
    return this.freezeClip(clip);
  }

  async moveClip(input: MoveClipInput): Promise<Clip> {
    const { clip, track, seq } = this.findClip(input.clipId);
    const duration = clip.timelineRange.end - clip.timelineRange.start;
    clip.timelineRange = { start: input.newStart, end: (input.newStart + duration) as Seconds };
    if (input.newTrackId && input.newTrackId !== track.id) {
      const newTrack = seq.tracks.find((t) => t.id === input.newTrackId);
      if (!newTrack) throw new NotFoundError('Track', input.newTrackId);
      track.clips = track.clips.filter((c) => c.id !== clip.id);
      clip.trackId = newTrack.id;
      newTrack.clips.push(clip);
      newTrack.clips.sort((a, b) => a.timelineRange.start - b.timelineRange.start);
    }
    return this.freezeClip(clip);
  }

  async deleteClip(clipId: string): Promise<void> {
    const { track } = this.findClip(clipId);
    track.clips = track.clips.filter((c) => c.id !== clipId);
  }

  /** A3 — Mock: đảo cờ enabled của clip. */
  async setClipDisabled(clipId: string, disabled: boolean): Promise<void> {
    const { clip } = this.findClip(clipId);
    const idx = clip.effects.findIndex((e) => e.matchName === '__disabled__');
    void idx;
    (clip as { enabled?: boolean }).enabled = !disabled;
  }

  async renameClip(clipId: string, newName: string): Promise<void> {
    if (!newName || !newName.trim()) throw new Error('renameClip: newName rỗng');
    const { clip } = this.findClip(clipId);
    (clip as { name?: string }).name = newName;
  }

  async setClipInOut(clipId: string, inSec: Seconds, outSec: Seconds): Promise<void> {
    if (!(outSec > inSec)) throw new Error(`setClipInOut: outSec phải > inSec`);
    const { clip } = this.findClip(clipId);
    const dur = (outSec - inSec) as Seconds;
    // Giữ vị trí timeline; đổi source in/out + rút thời lượng on-timeline.
    clip.sourceRange = { start: inSec, end: outSec };
    clip.timelineRange = {
      start: clip.timelineRange.start,
      end: (clip.timelineRange.start + dur) as Seconds,
    };
  }

  async listTracks(sequenceId: string): Promise<readonly Track[]> {
    const s = this.requireSequence(sequenceId);
    return s.tracks.map((t) => ({
      id: t.id,
      index: t.index,
      kind: t.kind,
      name: t.name,
      muted: t.muted,
      locked: t.locked,
      clips: t.clips.map((c) => this.freezeClip(c)),
    }));
  }

  async applyEffect(input: ApplyEffectInput): Promise<Effect> {
    const { clip } = this.findClip(input.clipId);
    const effect: Effect = {
      id: uniqueId('effect'),
      matchName: input.effectMatchName,
      displayName: input.effectMatchName,
      kind: 'video',
      enabled: true,
      params: [],
    };
    clip.effects.push(effect);
    return effect;
  }

  async removeEffect(clipId: string, effectId: string): Promise<void> {
    const { clip } = this.findClip(clipId);
    clip.effects = clip.effects.filter((e) => e.id !== effectId);
  }

  async importFile(input: ImportFileInput): Promise<{ id: string; path: string }> {
    const id = uniqueId('media');
    const seq = this.activeSequenceId ? this.requireSequence(this.activeSequenceId) : null;
    if (seq) {
      const videoTrack = seq.tracks.find((t) => t.kind === 'video');
      if (videoTrack) {
        const lastEnd = videoTrack.clips.reduce((m, c) => Math.max(m, c.timelineRange.end), 0);
        const dur = 5;
        videoTrack.clips.push({
          id: uniqueId('clip'),
          name: input.path.split(/[\\/]/).pop() ?? 'imported',
          kind: 'video',
          trackId: videoTrack.id,
          timelineRange: { start: seconds(lastEnd), end: seconds(lastEnd + dur) },
          sourceRange: { start: seconds(0), end: seconds(dur) },
          source: { path: input.path, duration: seconds(dur), hasVideo: true, hasAudio: false },
          effects: [],
          enabled: true,
        });
      }
    }
    return { id, path: input.path };
  }

  async addMarker(input: AddMarkerInput): Promise<Marker> {
    const seq = this.requireSequence(input.sequenceId);
    const marker: Marker = {
      id: uniqueId('marker'),
      time: input.time,
      duration: seconds(0),
      kind: 'comment',
      name: input.name,
      comment: input.comment ?? '',
      color: input.color ?? '#ffcc00',
    };
    seq.markers.push(marker);
    return marker;
  }

  async listMarkers(sequenceId: string): Promise<readonly Marker[]> {
    return [...this.requireSequence(sequenceId).markers];
  }

  async deleteMarker(sequenceId: string, markerId: string): Promise<void> {
    const seq = this.requireSequence(sequenceId);
    seq.markers = seq.markers.filter((m) => m.id !== markerId);
  }

  async exportSequence(input: ExportInput): Promise<{ jobId: string }> {
    this.requireSequence(input.sequenceId);
    return { jobId: uniqueId('export') };
  }

  async addKeyframe(_input: KeyframeInput): Promise<void> {
    // Mock: no-op
  }

  /**
   * V1 — Mirror uxp.ts behaviour so unit tests verify the same shape
   * production hits. Previously this stored a fake match-name
   * `Lumetri:${name}` that masked the real bug in the UXP path. Now:
   *   1. Resolve recipe; throw same AdapterError-shape on unknown key.
   *   2. Ensure ONE `AE.ADBE Lumetri` effect entry on the clip.
   *   3. Delegate to setColorParams to write recipe values.
   * Match-name is the canonical Adobe ID — what real Premiere returns.
   */
  async applyColorPreset(clipId: string, presetName: string): Promise<void> {
    const recipe = getLumetriRecipe(presetName);
    if (!recipe) {
      throw new Error(
        `Unknown Lumetri preset "${presetName}". Valid keys: ${LUMETRI_PRESET_KEYS.join(', ')}`
      );
    }
    const { clip } = this.findClip(clipId);
    let lumetri = clip.effects.find((e) => e.matchName === 'AE.ADBE Lumetri');
    if (!lumetri) {
      lumetri = {
        id: uniqueId('effect'),
        matchName: 'AE.ADBE Lumetri',
        displayName: 'Lumetri Color',
        kind: 'color',
        enabled: true,
        params: [],
      };
      clip.effects.push(lumetri);
    }
    await this.setColorParams({ clipId, ...recipe });
  }

  async setColorParams(input: ColorParamsInput): Promise<void> {
    const { clip } = this.findClip(input.clipId);
    // V1 — mirror UXP: real Lumetri component matchName is 'AE.ADBE Lumetri',
    // never 'Lumetri:Custom'. Find by the canonical ID.
    let lumetri = clip.effects.find(
      (e) => e.matchName === 'AE.ADBE Lumetri' || e.matchName.toLowerCase().includes('lumetri')
    );
    if (!lumetri) {
      lumetri = {
        id: uniqueId('effect'),
        matchName: 'AE.ADBE Lumetri',
        displayName: 'Lumetri Color',
        kind: 'color',
        enabled: true,
        params: [],
      };
      clip.effects.push(lumetri);
    }
    const newParams = [...lumetri.params];
    for (const [k, v] of Object.entries(input)) {
      if (k === 'clipId' || v === undefined) continue;
      const i = newParams.findIndex((p) => p.name === k);
      if (i >= 0) newParams[i] = { name: k, value: v };
      else newParams.push({ name: k, value: v });
    }
    const idx = clip.effects.indexOf(lumetri);
    clip.effects[idx] = { ...lumetri, params: newParams };
  }

  async setAudioGain(input: AudioGainInput): Promise<void> {
    const { clip } = this.findClip(input.clipId);
    let gain = clip.effects.find((e) => e.matchName === 'AudioGain');
    if (!gain) {
      gain = {
        id: uniqueId('effect'),
        matchName: 'AudioGain',
        displayName: 'Audio Gain',
        kind: 'audio',
        enabled: true,
        params: [{ name: 'gainDb', value: input.gainDb }],
      };
      clip.effects.push(gain);
    } else {
      const idx = clip.effects.indexOf(gain);
      clip.effects[idx] = { ...gain, params: [{ name: 'gainDb', value: input.gainDb }] };
    }
  }

  async addAudioFade(input: AudioFadeInput): Promise<void> {
    const { clip } = this.findClip(input.clipId);
    clip.effects.push({
      id: uniqueId('effect'),
      matchName: `AudioFade:${input.type}`,
      displayName: `Audio Fade ${input.type}`,
      kind: 'audio',
      enabled: true,
      params: [{ name: 'durationSec', value: input.durationSec }],
    });
  }

  async muteTrack(sequenceId: string, trackId: string, muted: boolean): Promise<void> {
    const seq = this.requireSequence(sequenceId);
    const track = seq.tracks.find((t) => t.id === trackId);
    if (!track) throw new NotFoundError('Track', trackId);
    track.muted = muted;
  }

  async addTextOverlay(input: TextOverlayInput): Promise<{ clipId: string }> {
    const seq = this.requireSequence(input.sequenceId);
    const track = seq.tracks[input.trackIndex] ?? seq.tracks.find((t) => t.kind === 'video');
    if (!track) throw new NotFoundError('Track', `index ${input.trackIndex}`);
    const id = uniqueId('clip');
    track.clips.push({
      id,
      name: `Text: ${input.text.slice(0, 20)}`,
      kind: 'title',
      trackId: track.id,
      timelineRange: { start: input.startTime, end: (input.startTime + input.duration) as Seconds },
      sourceRange: { start: seconds(0), end: input.duration },
      source: { path: '<text>', duration: input.duration, hasVideo: true, hasAudio: false },
      effects: [
        {
          id: uniqueId('effect'),
          matchName: 'TextOverlay',
          displayName: 'Text',
          kind: 'text',
          enabled: true,
          params: [
            { name: 'text', value: input.text },
            { name: 'font', value: input.font ?? 'Arial' },
            { name: 'fontSize', value: input.fontSize ?? 48 },
          ],
        },
      ],
      enabled: true,
    });
    track.clips.sort((a, b) => a.timelineRange.start - b.timelineRange.start);
    return { clipId: id };
  }

  async applyTransition(input: TransitionInput): Promise<void> {
    this.findClip(input.clipIdA);
    this.findClip(input.clipIdB);
  }

  async listTransitions(): Promise<readonly { matchName: string; displayName: string }[]> {
    return [
      { matchName: 'CrossDissolve', displayName: 'Cross Dissolve' },
      { matchName: 'DipToBlack', displayName: 'Dip to Black' },
      { matchName: 'DipToWhite', displayName: 'Dip to White' },
      { matchName: 'FilmDissolve', displayName: 'Film Dissolve' },
      { matchName: 'CrossZoom', displayName: 'Cross Zoom' },
      { matchName: 'WhipPan', displayName: 'Whip Pan' },
    ];
  }

  async beginUndoGroup(label: string): Promise<void> {
    this.undoStack.push({ label, ops: 0 });
  }

  async endUndoGroup(): Promise<void> {
    this.undoStack.pop();
  }
}

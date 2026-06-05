/**
 * P5.03c — DaVinciAdapter.
 *
 * Real adapter that routes INLEAdapter methods through the
 * `IDaVinciBridge` (which proxies to the Python Resolve API).
 *
 * Today every method translates the request name + args directly and
 * returns whatever the bridge returns. The Python side
 * (`scripts/da-bridge.py`, owner-completed when Resolve is installed
 * for testing) is responsible for honouring the same shape as our
 * Premiere adapter — we map at the language boundary, not at the
 * NLE boundary.
 *
 * The adapter throws `Error` on any bridge `{ ok: false }` response.
 * The dispatcher's existing retry + cancellation logic still applies.
 */
import type {
  AddMarkerInput,
  ApplyEffectInput,
  AudioFadeInput,
  AudioGainInput,
  ColorParamsInput,
  CutClipInput,
  ExportInput,
  ImportFileInput,
  KeyframeInput,
  MoveClipInput,
  INLEAdapter,
  TextOverlayInput,
  TransitionInput,
  TrimClipInput,
} from '@directorai/premiere-adapter';
import type { Clip, Effect, Marker, Project, Sequence, Track } from '@directorai/core';
import type { IDaVinciBridge } from './bridge.js';

export interface DaVinciAdapterOptions {
  bridge: IDaVinciBridge;
}

export class DaVinciAdapter implements INLEAdapter {
  readonly kind = 'davinci' as const;
  private nextId = 1;

  constructor(private readonly opts: DaVinciAdapterOptions) {}

  private async invoke<T>(method: string, params?: unknown): Promise<T> {
    const res = await this.opts.bridge.call({ id: this.nextId++, method, params });
    if (!res.ok) {
      throw new Error(`DaVinci bridge ${method} failed: ${res.error}`);
    }
    return res.result as T;
  }

  /** Cleanly shut the bridge down. Idempotent. */
  async close(): Promise<void> {
    await this.opts.bridge.close();
  }

  // ── Project ───────────────────────────────────────────────────────────────
  getProject(): Promise<Project> {
    return this.invoke('project.get');
  }
  listSequences(): Promise<readonly Sequence[]> {
    return this.invoke('project.listSequences');
  }
  setActiveSequence(sequenceId: string): Promise<void> {
    return this.invoke('project.setActiveSequence', { sequenceId });
  }
  getActiveSequence(): Promise<Sequence | null> {
    return this.invoke('project.getActiveSequence');
  }

  // ── Timeline read ─────────────────────────────────────────────────────────
  listClips(sequenceId: string): Promise<readonly Clip[]> {
    return this.invoke('timeline.listClips', { sequenceId });
  }
  getClip(clipId: string): Promise<Clip | null> {
    return this.invoke('timeline.getClip', { clipId });
  }
  listTracks(sequenceId: string): Promise<readonly Track[]> {
    return this.invoke('tracks.list', { sequenceId });
  }

  // ── Timeline edit ─────────────────────────────────────────────────────────
  cutClip(input: CutClipInput): Promise<readonly Clip[]> {
    return this.invoke('timeline.cutClip', input);
  }
  trimClip(input: TrimClipInput): Promise<Clip> {
    return this.invoke('timeline.trimClip', input);
  }
  moveClip(input: MoveClipInput): Promise<Clip> {
    return this.invoke('timeline.moveClip', input);
  }
  deleteClip(clipId: string): Promise<void> {
    return this.invoke('timeline.deleteClip', { clipId });
  }

  // ── Effects ───────────────────────────────────────────────────────────────
  applyEffect(input: ApplyEffectInput): Promise<Effect> {
    return this.invoke('effect.apply', input);
  }
  removeEffect(clipId: string, effectId: string): Promise<void> {
    return this.invoke('effect.remove', { clipId, effectId });
  }

  // ── Media ─────────────────────────────────────────────────────────────────
  importFile(input: ImportFileInput): Promise<{ id: string; path: string }> {
    return this.invoke('media.import', input);
  }

  // ── Markers ───────────────────────────────────────────────────────────────
  addMarker(input: AddMarkerInput): Promise<Marker> {
    return this.invoke('marker.add', input);
  }
  listMarkers(sequenceId: string): Promise<readonly Marker[]> {
    return this.invoke('marker.list', { sequenceId });
  }
  deleteMarker(sequenceId: string, markerId: string): Promise<void> {
    return this.invoke('marker.delete', { sequenceId, markerId });
  }

  // ── Export ────────────────────────────────────────────────────────────────
  exportSequence(input: ExportInput): Promise<{ jobId: string }> {
    return this.invoke('export.sequence', input);
  }

  // ── Color / keyframes / audio ─────────────────────────────────────────────
  addKeyframe(input: KeyframeInput): Promise<void> {
    return this.invoke('keyframe.add', input);
  }
  applyColorPreset(clipId: string, presetName: string): Promise<void> {
    return this.invoke('color.applyPreset', { clipId, presetName });
  }
  setColorParams(input: ColorParamsInput): Promise<void> {
    return this.invoke('color.setParams', input);
  }
  setAudioGain(input: AudioGainInput): Promise<void> {
    return this.invoke('audio.setGain', input);
  }
  addAudioFade(input: AudioFadeInput): Promise<void> {
    return this.invoke('audio.addFade', input);
  }
  muteTrack(sequenceId: string, trackId: string, muted: boolean): Promise<void> {
    return this.invoke('audio.muteTrack', { sequenceId, trackId, muted });
  }

  // ── Text / transitions ────────────────────────────────────────────────────
  addTextOverlay(input: TextOverlayInput): Promise<{ clipId: string }> {
    return this.invoke('text.addOverlay', input);
  }
  applyTransition(input: TransitionInput): Promise<void> {
    return this.invoke('transition.apply', input);
  }
  removeTransition(clipId: string, atStart = true): Promise<void> {
    return this.invoke('transition.remove', { clipId, atStart });
  }
  listTransitions(): Promise<readonly { matchName: string; displayName: string }[]> {
    return this.invoke('transition.list');
  }

  // ── Undo ──────────────────────────────────────────────────────────────────
  beginUndoGroup(label: string): Promise<void> {
    return this.invoke('undo.begin', { label });
  }
  endUndoGroup(): Promise<void> {
    return this.invoke('undo.end');
  }
}

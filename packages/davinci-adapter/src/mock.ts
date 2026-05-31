/**
 * P5.03b — Mock DaVinci adapter (composition over inheritance).
 *
 * Same behavioural contract as `MockPremiereAdapter`. We compose
 * rather than subclass because `MockPremiereAdapter.kind` is a
 * literal `'mock' as const` and can't be widened by a subclass.
 *
 * Why a mock at all? The cut planner, executor, dispatcher, and
 * any plugin should work against `INLEAdapter` without caring which
 * host is on the other side. Shipping a DaVinci-flavoured mock
 * means tests can assert host detection + adapter selection without
 * a DaVinci install on the test machine.
 */
import { MockPremiereAdapter } from '@directorai/premiere-adapter';
import type {
  AddMarkerInput,
  ApplyEffectInput,
  AudioFadeInput,
  AudioGainInput,
  ColorParamsInput,
  CutClipInput,
  ExportInput,
  ImportFileInput,
  INLEAdapter,
  KeyframeInput,
  MoveClipInput,
  TextOverlayInput,
  TransitionInput,
  TrimClipInput,
} from '@directorai/premiere-adapter';
import type { Clip, Effect, Marker, Project, Sequence, Track } from '@directorai/core';

export class MockDaVinciAdapter implements INLEAdapter {
  readonly kind = 'davinci' as const;
  private readonly inner = new MockPremiereAdapter();

  getProject(): Promise<Project> {
    return this.inner.getProject();
  }
  listSequences(): Promise<readonly Sequence[]> {
    return this.inner.listSequences();
  }
  setActiveSequence(id: string): Promise<void> {
    return this.inner.setActiveSequence(id);
  }
  getActiveSequence(): Promise<Sequence | null> {
    return this.inner.getActiveSequence();
  }
  listClips(sequenceId: string): Promise<readonly Clip[]> {
    return this.inner.listClips(sequenceId);
  }
  getClip(clipId: string): Promise<Clip | null> {
    return this.inner.getClip(clipId);
  }
  listTracks(sequenceId: string): Promise<readonly Track[]> {
    return this.inner.listTracks(sequenceId);
  }
  cutClip(input: CutClipInput): Promise<readonly Clip[]> {
    return this.inner.cutClip(input);
  }
  trimClip(input: TrimClipInput): Promise<Clip> {
    return this.inner.trimClip(input);
  }
  moveClip(input: MoveClipInput): Promise<Clip> {
    return this.inner.moveClip(input);
  }
  deleteClip(clipId: string): Promise<void> {
    return this.inner.deleteClip(clipId);
  }
  applyEffect(input: ApplyEffectInput): Promise<Effect> {
    return this.inner.applyEffect(input);
  }
  removeEffect(clipId: string, effectId: string): Promise<void> {
    return this.inner.removeEffect(clipId, effectId);
  }
  importFile(input: ImportFileInput): Promise<{ id: string; path: string }> {
    return this.inner.importFile(input);
  }
  addMarker(input: AddMarkerInput): Promise<Marker> {
    return this.inner.addMarker(input);
  }
  listMarkers(sequenceId: string): Promise<readonly Marker[]> {
    return this.inner.listMarkers(sequenceId);
  }
  deleteMarker(sequenceId: string, markerId: string): Promise<void> {
    return this.inner.deleteMarker(sequenceId, markerId);
  }
  exportSequence(input: ExportInput): Promise<{ jobId: string }> {
    return this.inner.exportSequence(input);
  }
  addKeyframe(input: KeyframeInput): Promise<void> {
    return this.inner.addKeyframe(input);
  }
  applyColorPreset(clipId: string, presetName: string): Promise<void> {
    return this.inner.applyColorPreset(clipId, presetName);
  }
  setColorParams(input: ColorParamsInput): Promise<void> {
    return this.inner.setColorParams(input);
  }
  setAudioGain(input: AudioGainInput): Promise<void> {
    return this.inner.setAudioGain(input);
  }
  addAudioFade(input: AudioFadeInput): Promise<void> {
    return this.inner.addAudioFade(input);
  }
  muteTrack(sequenceId: string, trackId: string, muted: boolean): Promise<void> {
    return this.inner.muteTrack(sequenceId, trackId, muted);
  }
  addTextOverlay(input: TextOverlayInput): Promise<{ clipId: string }> {
    return this.inner.addTextOverlay(input);
  }
  applyTransition(input: TransitionInput): Promise<void> {
    return this.inner.applyTransition(input);
  }
  listTransitions(): Promise<readonly { matchName: string; displayName: string }[]> {
    return this.inner.listTransitions();
  }
  beginUndoGroup(label: string): Promise<void> {
    return this.inner.beginUndoGroup(label);
  }
  endUndoGroup(): Promise<void> {
    return this.inner.endUndoGroup();
  }
}

import type { Project, Sequence, Clip, Track, Effect, Marker } from '@directorai/core';
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

/**
 * Function that delivers an RPC call to the remote endpoint
 * (typically the UXP panel) and resolves with the result.
 */
export type RemoteSend = <T = unknown>(method: string, params?: unknown) => Promise<T>;

/**
 * Adapter that lives on the Node server side and forwards every call
 * to the connected UXP panel over WebSocket JSON-RPC. The panel
 * executes the call via its local UXPPremiereAdapter and returns the
 * result.
 *
 * Methods + parameter names mirror the RPC dispatcher exactly.
 */
export class RemotePremiereAdapter implements IPremiereAdapter {
  readonly kind = 'uxp' as const;

  constructor(private readonly send: RemoteSend) {}

  // Project
  getProject(): Promise<Project> {
    return this.send<Project>('project.get');
  }
  listSequences(): Promise<readonly Sequence[]> {
    return this.send<readonly Sequence[]>('project.listSequences');
  }
  setActiveSequence(sequenceId: string): Promise<void> {
    return this.send<void>('project.setActiveSequence', { sequenceId });
  }
  getActiveSequence(): Promise<Sequence | null> {
    return this.send<Sequence | null>('project.getActiveSequence');
  }

  // Timeline read
  listClips(sequenceId: string): Promise<readonly Clip[]> {
    return this.send<readonly Clip[]>('timeline.listClips', { sequenceId });
  }
  getClip(clipId: string): Promise<Clip | null> {
    return this.send<Clip | null>('timeline.getClip', { clipId });
  }
  listTracks(sequenceId: string): Promise<readonly Track[]> {
    return this.send<readonly Track[]>('tracks.list', { sequenceId });
  }

  // Timeline edit
  cutClip(input: CutClipInput): Promise<readonly Clip[]> {
    return this.send<readonly Clip[]>('timeline.cutClip', input);
  }
  trimClip(input: TrimClipInput): Promise<Clip> {
    return this.send<Clip>('timeline.trimClip', input);
  }
  moveClip(input: MoveClipInput): Promise<Clip> {
    return this.send<Clip>('timeline.moveClip', input);
  }
  deleteClip(clipId: string): Promise<void> {
    return this.send<void>('timeline.deleteClip', { clipId });
  }
  setClipDisabled(clipId: string, disabled: boolean): Promise<void> {
    return this.send<void>('timeline.setClipDisabled', { clipId, disabled });
  }
  renameClip(clipId: string, newName: string): Promise<void> {
    return this.send<void>('timeline.renameClip', { clipId, newName });
  }

  // Effects
  applyEffect(input: ApplyEffectInput): Promise<Effect> {
    return this.send<Effect>('effect.apply', input);
  }
  removeEffect(clipId: string, effectId: string): Promise<void> {
    return this.send<void>('effect.remove', { clipId, effectId });
  }

  // Media
  importFile(input: ImportFileInput): Promise<{ id: string; path: string }> {
    return this.send<{ id: string; path: string }>('media.import', input);
  }

  // Markers
  addMarker(input: AddMarkerInput): Promise<Marker> {
    return this.send<Marker>('marker.add', input);
  }
  listMarkers(sequenceId: string): Promise<readonly Marker[]> {
    return this.send<readonly Marker[]>('marker.list', { sequenceId });
  }
  deleteMarker(sequenceId: string, markerId: string): Promise<void> {
    return this.send<void>('marker.delete', { sequenceId, markerId });
  }

  // Export
  exportSequence(input: ExportInput): Promise<{ jobId: string }> {
    return this.send<{ jobId: string }>('export.sequence', input);
  }

  // Keyframes
  addKeyframe(input: KeyframeInput): Promise<void> {
    return this.send<void>('keyframe.add', input);
  }

  // Color
  applyColorPreset(clipId: string, presetName: string): Promise<void> {
    return this.send<void>('color.applyPreset', { clipId, presetName });
  }
  setColorParams(input: ColorParamsInput): Promise<void> {
    return this.send<void>('color.setParams', input);
  }

  // Audio
  setAudioGain(input: AudioGainInput): Promise<void> {
    return this.send<void>('audio.setGain', input);
  }
  addAudioFade(input: AudioFadeInput): Promise<void> {
    return this.send<void>('audio.addFade', input);
  }
  muteTrack(sequenceId: string, trackId: string, muted: boolean): Promise<void> {
    return this.send<void>('audio.muteTrack', { sequenceId, trackId, muted });
  }

  // Text
  addTextOverlay(input: TextOverlayInput): Promise<{ clipId: string }> {
    return this.send<{ clipId: string }>('text.addOverlay', input);
  }

  // Transitions
  applyTransition(input: TransitionInput): Promise<void> {
    return this.send<void>('transition.apply', input);
  }
  listTransitions(): Promise<readonly { matchName: string; displayName: string }[]> {
    return this.send<readonly { matchName: string; displayName: string }[]>('transition.list');
  }

  // Undo
  beginUndoGroup(label: string): Promise<void> {
    return this.send<void>('undo.begin', { label });
  }
  endUndoGroup(): Promise<void> {
    return this.send<void>('undo.end');
  }
}

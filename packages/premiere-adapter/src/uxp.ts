import { AdapterError } from '@directorai/shared';
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
 * Real adapter that calls Premiere via UXP API.
 *
 * Note: This module is meant to run INSIDE the UXP plugin context where
 * `require('premierepro')` works. When running on Node (e.g. tests), it
 * will throw at construction. Use MockPremiereAdapter for non-UXP env.
 *
 * Each method below is a thin wrapper around the UXP API. The actual UXP
 * calls are stubbed pending P1.04+ implementation against a running
 * Premiere Pro instance.
 */
export class UXPPremiereAdapter implements IPremiereAdapter {
  readonly kind = 'uxp' as const;

  private ppro: unknown;

  constructor() {
    try {
      this.ppro = (globalThis as { require?: (m: string) => unknown }).require?.('premierepro');
      if (!this.ppro) {
        throw new Error('premierepro module not available — are we inside UXP?');
      }
    } catch (err) {
      throw new AdapterError('UXP', 'Failed to load premierepro module', err);
    }
  }

  private notImplemented(method: string): never {
    throw new AdapterError('UXP', `${method} not yet implemented — TODO in P1.04+`);
  }

  async getProject(): Promise<Project> {
    this.notImplemented('getProject');
  }

  async listSequences(): Promise<readonly Sequence[]> {
    this.notImplemented('listSequences');
  }

  async setActiveSequence(_id: string): Promise<void> {
    this.notImplemented('setActiveSequence');
  }

  async getActiveSequence(): Promise<Sequence | null> {
    this.notImplemented('getActiveSequence');
  }

  async listClips(_seqId: string): Promise<readonly Clip[]> {
    this.notImplemented('listClips');
  }

  async getClip(_id: string): Promise<Clip | null> {
    this.notImplemented('getClip');
  }

  async cutClip(_input: CutClipInput): Promise<readonly Clip[]> {
    this.notImplemented('cutClip');
  }

  async trimClip(_input: TrimClipInput): Promise<Clip> {
    this.notImplemented('trimClip');
  }

  async moveClip(_input: MoveClipInput): Promise<Clip> {
    this.notImplemented('moveClip');
  }

  async deleteClip(_id: string): Promise<void> {
    this.notImplemented('deleteClip');
  }

  async listTracks(_seqId: string): Promise<readonly Track[]> {
    this.notImplemented('listTracks');
  }

  async applyEffect(_input: ApplyEffectInput): Promise<Effect> {
    this.notImplemented('applyEffect');
  }

  async removeEffect(_clipId: string, _effectId: string): Promise<void> {
    this.notImplemented('removeEffect');
  }

  async importFile(_input: ImportFileInput): Promise<{ id: string; path: string }> {
    this.notImplemented('importFile');
  }

  async addMarker(_input: AddMarkerInput): Promise<Marker> {
    this.notImplemented('addMarker');
  }

  async listMarkers(_seqId: string): Promise<readonly Marker[]> {
    this.notImplemented('listMarkers');
  }

  async deleteMarker(_seqId: string, _markerId: string): Promise<void> {
    this.notImplemented('deleteMarker');
  }

  async exportSequence(_input: ExportInput): Promise<{ jobId: string }> {
    this.notImplemented('exportSequence');
  }

  async addKeyframe(_i: KeyframeInput): Promise<void> {
    this.notImplemented('addKeyframe');
  }
  async applyColorPreset(_c: string, _p: string): Promise<void> {
    this.notImplemented('applyColorPreset');
  }
  async setColorParams(_i: ColorParamsInput): Promise<void> {
    this.notImplemented('setColorParams');
  }
  async setAudioGain(_i: AudioGainInput): Promise<void> {
    this.notImplemented('setAudioGain');
  }
  async addAudioFade(_i: AudioFadeInput): Promise<void> {
    this.notImplemented('addAudioFade');
  }
  async muteTrack(_s: string, _t: string, _m: boolean): Promise<void> {
    this.notImplemented('muteTrack');
  }
  async addTextOverlay(_i: TextOverlayInput): Promise<{ clipId: string }> {
    this.notImplemented('addTextOverlay');
  }
  async applyTransition(_i: TransitionInput): Promise<void> {
    this.notImplemented('applyTransition');
  }
  async listTransitions(): Promise<readonly { matchName: string; displayName: string }[]> {
    this.notImplemented('listTransitions');
  }

  async beginUndoGroup(_label: string): Promise<void> {
    this.notImplemented('beginUndoGroup');
  }

  async endUndoGroup(): Promise<void> {
    this.notImplemented('endUndoGroup');
  }
}

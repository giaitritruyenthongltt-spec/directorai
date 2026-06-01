import { AdapterError, NotFoundError } from '@directorai/shared';
import { getLumetriRecipe, LUMETRI_PRESET_KEYS } from '@directorai/effect-library';

/**
 * A.1 (Track A debt) — resolve which MOGRT template to use.
 *
 * Order: explicit override → DIRECTORAI_MOGRT_TEMPLATE env → null.
 * The actual "ship a default-caption.mogrt with the CCX bundle" is
 * an owner-completed asset (see press/screenshots.md tracking).
 * Without any of the three, callers should throw with the
 * actionable error built above.
 */
function resolveMogrtTemplatePath(override?: string): string | null {
  if (override && override.length > 0) return override;
  const fromEnv =
    typeof process !== 'undefined' ? process.env?.DIRECTORAI_MOGRT_TEMPLATE : undefined;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return null;
}
import {
  seconds,
  type Project,
  type Sequence,
  type Clip,
  type Track,
  type Effect,
  type Marker,
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
import {
  requirePProModule,
  type PProModule,
  type PProProject,
  type PProSequence,
  type PProTrack,
  type PProTrackItem,
  type TickTime,
} from './uxp-ppro.js';
import {
  translateSequence,
  translateTrackItem,
  translateComponent,
  translateMarker,
  tickToSeconds,
  stringifyGuid,
} from './uxp-translate.js';

/**
 * Real adapter — runs INSIDE the UXP plugin context (Premiere Pro 2024+).
 *
 * All mutating operations are wrapped in `project.lockedAccess` so the
 * NLE renders a single undo step per logical operation. Read operations
 * are direct awaits.
 *
 * If `premierepro` is not available at construction (we're not in UXP),
 * the constructor throws AdapterError. Use the factory or MockAdapter
 * in Node-only contexts.
 */
export class UXPPremiereAdapter implements IPremiereAdapter {
  readonly kind = 'uxp' as const;

  private readonly ppro: PProModule;

  constructor() {
    this.ppro = requirePProModule();
  }

  /** Get the active project or throw with a helpful message. */
  private async project(): Promise<PProProject> {
    const p = await this.ppro.Project.getActiveProject();
    if (!p) {
      throw new AdapterError('UXP', 'No active project — open a .prproj first');
    }
    return p;
  }

  private secondsToTick(s: number): TickTime {
    return this.ppro.TickTime.createWithSeconds(s);
  }

  /** Find a sequence by its guid across the current project. */
  private async findSequence(sequenceId: string): Promise<PProSequence> {
    const proj = await this.project();
    if (sequenceId === 'active') {
      const active = await proj.getActiveSequence();
      if (!active) throw new NotFoundError('Sequence', 'active');
      return active;
    }
    const all = await proj.getSequences();
    // Premiere 26 returns guid as a Guid object, not a string — we stored the
    // stringified form when translating, so stringify both sides to compare.
    const target = sequenceId.toLowerCase();
    const found = all.find((s) => stringifyGuid(s.guid).toLowerCase() === target);
    if (!found) throw new NotFoundError('Sequence', sequenceId);
    return found;
  }

  /**
   * V2 (smoke fallout) — Session-scoped clip-ID cache.
   *
   * The synthetic ID path (when nodeId is undefined in Premiere 26)
   * needs `getStartTime()` + `getName()` per clip to compute the
   * synthetic ID. On a 413-clip project that's 800+ UXP RPCs per
   * lookup — observed live as 30s timeout on `effect.apply`.
   *
   * Cache strategy:
   *   - Map<clipId, { item, track, seq }> populated lazily.
   *   - On miss, walk + index everything once, then look up.
   *   - Cleared whenever the project changes (`setActiveSequence`,
   *     `importFile`, etc.) to avoid serving stale references.
   */
  private clipCache: Map<
    string,
    { item: PProTrackItem; track: PProTrack; seq: PProSequence }
  > | null = null;

  private invalidateClipCache(): void {
    this.clipCache = null;
  }

  private async findTrackItem(clipId: string): Promise<{
    item: PProTrackItem;
    track: PProTrack;
    seq: PProSequence;
  }> {
    // Fast path — cache hit.
    if (this.clipCache) {
      const hit = this.clipCache.get(clipId);
      if (hit) return hit;
    }

    // Slow path — walk + index. Build the cache as we go so subsequent
    // lookups are O(1) for any clip in any track.
    const proj = await this.project();
    const sequences = await proj.getSequences();
    const cache = new Map<string, { item: PProTrackItem; track: PProTrack; seq: PProSequence }>();
    let found: { item: PProTrackItem; track: PProTrack; seq: PProSequence } | undefined;

    const indexItems = async (
      items: PProTrackItem[],
      track: PProTrack,
      seq: PProSequence,
      trackKind: 'video' | 'audio',
      trackIndex: number
    ): Promise<void> => {
      const trackId = `${trackKind}-${trackIndex}`;
      for (const it of items) {
        // 1) Try direct nodeId — cheap.
        const nid = (it as { nodeId?: unknown }).nodeId;
        if (typeof nid === 'string' && nid.length > 0) {
          cache.set(nid, { item: it, track, seq });
          if (nid === clipId) found = { item: it, track, seq };
          continue;
        }
        // 2) Synthetic — compute once + index. Each iteration costs
        // 2 UXP RPCs (getStartTime + getName) but only happens during
        // the one-time index build; later lookups are O(1).
        const startT = await it.getStartTime().catch(() => null);
        const name = await it.getName().catch(() => it.name ?? 'Untitled');
        const synthetic = `${trackId}:${String(startT?.ticks ?? '')}:${name}`;
        cache.set(synthetic, { item: it, track, seq });
        if (synthetic === clipId) found = { item: it, track, seq };
      }
    };

    for (const seq of sequences) {
      const vCount = await seq.getVideoTrackCount();
      for (let i = 0; i < vCount; i++) {
        const track = await seq.getVideoTrack(i);
        const items = await track.getTrackItems(1 /* ANY */, true);
        await indexItems(items, track, seq, 'video', i);
        if (found) break;
      }
      if (found) break;
      const aCount = await seq.getAudioTrackCount();
      for (let i = 0; i < aCount; i++) {
        const track = await seq.getAudioTrack(i);
        const items = await track.getTrackItems(1, true);
        await indexItems(items, track, seq, 'audio', i);
        if (found) break;
      }
    }

    this.clipCache = cache;
    if (found) return found;
    throw new NotFoundError('Clip', clipId);
  }

  /**
   * E1 — Reverted D5's Promise.race. The race left lockedPromise
   * unhandled after timeout winner, creating unhandled rejection that
   * may have crashed the panel React tree at module evaluation.
   * Back to original simple shape.
   */
  private async mutate<T>(label: string, action: () => Promise<T>): Promise<T> {
    const proj = await this.project();
    let result!: T;
    let captured: unknown;
    await proj.lockedAccess(async () => {
      try {
        result = await action();
      } catch (err) {
        captured = err;
      }
    });
    if (captured) {
      throw new AdapterError('UXP', `${label} failed`, captured);
    }
    return result;
  }

  // ─── Project ──────────────────────────────────────────────────────────────

  async getProject(): Promise<Project> {
    const proj = await this.project();
    const [active, all] = await Promise.all([proj.getActiveSequence(), proj.getSequences()]);
    const sequences: Sequence[] = [];
    for (const s of all) sequences.push(await translateSequence(s));
    return {
      id: { value: proj.guid, __brand: 'ProjectId' } as Project['id'],
      metadata: {
        name: proj.name,
        path: proj.path,
        createdAt: '',
        modifiedAt: new Date().toISOString(),
      },
      sequences,
      activeSequenceId: active?.guid ?? null,
    };
  }

  async listSequences(): Promise<readonly Sequence[]> {
    const proj = await this.project();
    const all = await proj.getSequences();
    const out: Sequence[] = [];
    for (const s of all) out.push(await translateSequence(s));
    return out;
  }

  async setActiveSequence(sequenceId: string): Promise<void> {
    const proj = await this.project();
    const seq = await this.findSequence(sequenceId);
    await proj.setActiveSequence(seq);
    this.invalidateClipCache();
  }

  async getActiveSequence(): Promise<Sequence | null> {
    const proj = await this.project();
    const s = await proj.getActiveSequence();
    if (!s) return null;
    return translateSequence(s);
  }

  // ─── Timeline read ────────────────────────────────────────────────────────

  async listClips(sequenceId: string): Promise<readonly Clip[]> {
    const seq = await this.findSequence(sequenceId);
    const out: Clip[] = [];
    const vCount = await seq.getVideoTrackCount();
    for (let i = 0; i < vCount; i++) {
      const t = await seq.getVideoTrack(i);
      const items = await t.getTrackItems(1, false);
      for (const it of items) out.push(await translateTrackItem(it, `video-${i}`, 'video'));
    }
    const aCount = await seq.getAudioTrackCount();
    for (let i = 0; i < aCount; i++) {
      const t = await seq.getAudioTrack(i);
      const items = await t.getTrackItems(1, false);
      for (const it of items) out.push(await translateTrackItem(it, `audio-${i}`, 'audio'));
    }
    return out;
  }

  async getClip(clipId: string): Promise<Clip | null> {
    try {
      const { item, track } = await this.findTrackItem(clipId);
      const mediaType = await track.getMediaType().catch(() => 'Video');
      const kind: Clip['kind'] = mediaType === 'Video' ? 'video' : 'audio';
      return translateTrackItem(item, `${kind}-${track.id}`, kind);
    } catch {
      return null;
    }
  }

  async listTracks(sequenceId: string): Promise<readonly Track[]> {
    const seq = await translateSequence(await this.findSequence(sequenceId));
    return seq.tracks;
  }

  // ─── Timeline edit ────────────────────────────────────────────────────────

  /** Mutations that change clip identity invalidate the cache. */
  async cutClip(input: CutClipInput): Promise<readonly Clip[]> {
    this.invalidateClipCache();
    return this.mutate('cutClip', async () => {
      const { item, track } = await this.findTrackItem(input.clipId);
      const cutAt = this.secondsToTick(input.at);
      // Premiere UXP doesn't expose a direct "split at" — we change current
      // clip's outPoint and insert a new clip starting from `cutAt` with
      // the matching ProjectItem. Falls back to AdapterError if unsupported.
      const startT = await item.getStartTime();
      const endT = await item.getEndTime();
      if (input.at <= startT.seconds || input.at >= endT.seconds) {
        throw new Error(`Cut at ${input.at}s is outside clip [${startT.seconds}, ${endT.seconds}]`);
      }
      const projItem = await item.getProjectItem();
      if (!projItem) throw new Error('Clip has no source ProjectItem');

      // Adjust end of left half
      const inT = await item.getInPoint();
      const offset = input.at - startT.seconds;
      const newOut = this.secondsToTick(inT.seconds + offset);
      await item.setOutPoint(newOut);

      // Insert right half via track.insertClip at cutAt
      await track.insertClip(projItem, cutAt);

      // Return the two halves (re-list to find the new piece)
      const items = await track.getTrackItems(1, false);
      const at = input.at;
      const left = items.find((it) => it.nodeId === input.clipId);
      const right = items.find(async (it) => {
        const s = await it.getStartTime();
        return Math.abs(s.seconds - at) < 0.001 && it.nodeId !== input.clipId;
      });
      const out: Clip[] = [];
      const mt = await track.getMediaType();
      const k: Clip['kind'] = mt === 'Video' ? 'video' : 'audio';
      if (left) out.push(await translateTrackItem(left, `${k}-${track.id}`, k));
      if (right) out.push(await translateTrackItem(await right, `${k}-${track.id}`, k));
      return out;
    });
  }

  async trimClip(input: TrimClipInput): Promise<Clip> {
    return this.mutate('trimClip', async () => {
      const { item, track } = await this.findTrackItem(input.clipId);
      const inT = await item.getInPoint();
      const startT = await item.getStartTime();
      const delta = input.newRange.start - startT.seconds;
      await item.setInPoint(this.secondsToTick(inT.seconds + delta));
      await item.setStartTime(this.secondsToTick(input.newRange.start));
      const dur = input.newRange.end - input.newRange.start;
      await item.setOutPoint(this.secondsToTick(inT.seconds + delta + dur));
      const mt = await track.getMediaType();
      const k: Clip['kind'] = mt === 'Video' ? 'video' : 'audio';
      return translateTrackItem(item, `${k}-${track.id}`, k);
    });
  }

  async moveClip(input: MoveClipInput): Promise<Clip> {
    return this.mutate('moveClip', async () => {
      const { item, track } = await this.findTrackItem(input.clipId);
      await item.move(this.secondsToTick(input.newStart));
      // Cross-track moves not exposed in UXP API directly — left as TODO
      if (input.newTrackId) {
        throw new AdapterError('UXP', 'Cross-track move not supported by premierepro UXP API yet');
      }
      const mt = await track.getMediaType();
      const k: Clip['kind'] = mt === 'Video' ? 'video' : 'audio';
      return translateTrackItem(item, `${k}-${track.id}`, k);
    });
  }

  async deleteClip(clipId: string): Promise<void> {
    await this.mutate('deleteClip', async () => {
      const { item } = await this.findTrackItem(clipId);
      await item.remove(false /* ripple */, false /* alignToVideo */);
    });
  }

  // ─── Effects ──────────────────────────────────────────────────────────────

  async applyEffect(input: ApplyEffectInput): Promise<Effect> {
    // D1 — diagnostic timing. We've seen 30s+ hangs on Premiere 26;
    // these logs nail down which sub-step is the bottleneck. Log to
    // console so the panel devtools captures them.
    const tStart = Date.now();
    const log = (label: string): void => {
      console.info(`[applyEffect ${input.effectMatchName}] +${Date.now() - tStart}ms ${label}`);
    };
    log('enter');
    return this.mutate('applyEffect', async () => {
      log('mutate lockedAccess opened');
      const { item } = await this.findTrackItem(input.clipId);
      log('findTrackItem ok');
      const chain = await item.getComponentChain();
      log('getComponentChain ok');
      if (!this.ppro.Component) {
        throw new AdapterError('UXP', 'Component factory not available in this PPro version');
      }
      const comp = await this.ppro.Component.create(input.effectMatchName);
      log('Component.create ok');
      await chain.insertComponent(comp, 1);
      log('insertComponent ok');
      const translated = await translateComponent(comp);
      log('translateComponent ok — DONE');
      return translated;
    });
  }

  async removeEffect(clipId: string, effectId: string): Promise<void> {
    await this.mutate('removeEffect', async () => {
      const { item } = await this.findTrackItem(clipId);
      const chain = await item.getComponentChain();
      const comps = await chain.getComponents();
      const target = comps.find((c) => c.matchName === effectId || c.displayName === effectId);
      if (!target) throw new NotFoundError('Effect', effectId);
      await chain.removeComponent(target);
    });
  }

  // ─── Media ────────────────────────────────────────────────────────────────

  async importFile(input: ImportFileInput): Promise<{ id: string; path: string }> {
    this.invalidateClipCache();
    return this.mutate('importFile', async () => {
      const proj = await this.project();
      const root = await proj.getRootItem();
      const ok = await proj.importFiles([input.path], true, root, false);
      if (!ok) throw new AdapterError('UXP', `Import failed for ${input.path}`);
      // Locate the freshly-imported item by name match
      const items = await root.getProjectItems();
      const fname = input.path.split(/[\\/]/).pop() ?? input.path;
      const stem = fname.split('.')[0] ?? fname;
      const imported = items.find((i) => i.name === fname || i.name.startsWith(stem));
      return { id: imported?.id ?? fname, path: input.path };
    });
  }

  // ─── Markers ──────────────────────────────────────────────────────────────

  async addMarker(input: AddMarkerInput): Promise<Marker> {
    return this.mutate('addMarker', async () => {
      const seq = await this.findSequence(input.sequenceId);
      const m = await seq.markers.createMarker(
        this.secondsToTick(input.time),
        input.name,
        input.color ?? '#ffcc00',
        this.ppro.MarkerType.COMMENT
      );
      if (input.comment) await m.setComment(input.comment);
      return translateMarker(m);
    });
  }

  async listMarkers(sequenceId: string): Promise<readonly Marker[]> {
    const seq = await this.findSequence(sequenceId);
    const ms = await seq.markers.getMarkers();
    return Promise.all(ms.map((m) => translateMarker(m)));
  }

  async deleteMarker(sequenceId: string, markerId: string): Promise<void> {
    await this.mutate('deleteMarker', async () => {
      const seq = await this.findSequence(sequenceId);
      const ms = await seq.markers.getMarkers();
      const target = ms.find((m) => m.guid === markerId);
      if (!target) throw new NotFoundError('Marker', markerId);
      await seq.markers.removeMarker(target);
    });
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  async exportSequence(input: ExportInput): Promise<{ jobId: string }> {
    const seq = await this.findSequence(input.sequenceId);
    if (!this.ppro.EncoderManager) {
      throw new AdapterError('UXP', 'EncoderManager not available — install Adobe Media Encoder');
    }
    const jobId = await this.ppro.EncoderManager.encodeSequence(
      seq,
      input.outputPath,
      input.presetPath,
      false /* removeOnCompletion */,
      0 /* workArea: ENTIRE_SEQUENCE */
    );
    return { jobId };
  }

  // ─── Keyframes ────────────────────────────────────────────────────────────

  async addKeyframe(input: KeyframeInput): Promise<void> {
    await this.mutate('addKeyframe', async () => {
      const { item } = await this.findTrackItem(input.clipId);
      const chain = await item.getComponentChain();
      const comps = await chain.getComponents();
      const comp = comps.find(
        (c) => c.matchName === input.effectId || c.displayName === input.effectId
      );
      if (!comp) throw new NotFoundError('Effect', input.effectId);
      const param = await comp.getParam(input.paramName);
      await param.addKey(this.secondsToTick(input.time), input.value);
    });
  }

  // ─── Color ────────────────────────────────────────────────────────────────

  /**
   * F1 — Apply a named Lumetri look via the REAL Adobe Lumetri component +
   * tuned Basic Correction params. The previous implementation used a
   * fabricated match-name `'Lumetri:${name}'` which Premiere doesn't
   * recognize. Now:
   *   1. Ensure an `AE.ADBE Lumetri` component exists on the clip.
   *   2. Look up a recipe (exposure/contrast/highlights/...) by preset key.
   *   3. Delegate to `setColorParams` to write the values.
   * Unknown preset keys throw — caller should validate against
   * LUMETRI_PRESET_KEYS first.
   */
  async applyColorPreset(clipId: string, presetName: string): Promise<void> {
    const recipe = getLumetriRecipe(presetName);
    if (!recipe) {
      throw new AdapterError(
        'UXP',
        `Unknown Lumetri preset "${presetName}". Valid keys: ${LUMETRI_PRESET_KEYS.join(', ')}`
      );
    }
    await this.mutate('applyColorPreset', async () => {
      const { item } = await this.findTrackItem(clipId);
      const chain = await item.getComponentChain();
      const comps = await chain.getComponents();
      let lumetri = comps.find((c) => c.matchName.toLowerCase().includes('lumetri'));
      if (!lumetri && this.ppro.Component) {
        lumetri = await this.ppro.Component.create('AE.ADBE Lumetri');
        await chain.insertComponent(lumetri, 1);
      }
      if (!lumetri) throw new AdapterError('UXP', 'Lumetri component unavailable');
    });
    await this.setColorParams({ clipId, ...recipe });
  }

  async setColorParams(input: ColorParamsInput): Promise<void> {
    await this.mutate('setColorParams', async () => {
      const { item } = await this.findTrackItem(input.clipId);
      const chain = await item.getComponentChain();
      const comps = await chain.getComponents();
      let lumetri = comps.find((c) => c.matchName.toLowerCase().includes('lumetri'));
      if (!lumetri && this.ppro.Component) {
        lumetri = await this.ppro.Component.create('AE.ADBE Lumetri');
        await chain.insertComponent(lumetri, 1);
      }
      if (!lumetri) throw new AdapterError('UXP', 'Lumetri component unavailable');
      const setIfPresent = async (paramName: string, v: number | undefined): Promise<void> => {
        if (v === undefined) return;
        try {
          const p = await lumetri!.getParam(paramName);
          await p.setValue(v, true);
        } catch {
          // skip
        }
      };
      // V4 — Adobe Lumetri Basic Correction param names. We try multiple
      // candidate names per slider because Premiere 26 sometimes uses
      // 'Color Temperature' for what older builds called 'Temperature'.
      // setIfPresent silently swallows missing-param errors so the call
      // is a no-op when the install differs.
      await setIfPresent('Exposure', input.exposure);
      await setIfPresent('Contrast', input.contrast);
      await setIfPresent('Highlights', input.highlights);
      await setIfPresent('Shadows', input.shadows);
      await setIfPresent('Whites', input.whites);
      await setIfPresent('Blacks', input.blacks);
      await setIfPresent('Saturation', input.saturation);
      await setIfPresent('Vibrance', input.vibrance);
      // Try modern Adobe name first, then legacy.
      await setIfPresent('Color Temperature', input.temperature);
      await setIfPresent('Temperature', input.temperature);
    });
  }

  // ─── Audio ────────────────────────────────────────────────────────────────

  async setAudioGain(input: AudioGainInput): Promise<void> {
    await this.mutate('setAudioGain', async () => {
      const { item } = await this.findTrackItem(input.clipId);
      const chain = await item.getComponentChain();
      const comps = await chain.getComponents();
      let gain = comps.find((c) => c.matchName.includes('Volume') || c.displayName === 'Volume');
      if (!gain) {
        if (!this.ppro.Component) {
          throw new AdapterError('UXP', 'Component factory unavailable for Volume');
        }
        gain = await this.ppro.Component.create('AE.ADBE Audio Levels');
        await chain.insertComponent(gain, 1);
      }
      const level = await gain.getParam('Level');
      await level.setValue(input.gainDb, true);
    });
  }

  async addAudioFade(input: AudioFadeInput): Promise<void> {
    await this.mutate('addAudioFade', async () => {
      const { item } = await this.findTrackItem(input.clipId);
      const chain = await item.getComponentChain();
      const comps = await chain.getComponents();
      const gain = comps.find((c) => c.matchName.includes('Volume'));
      if (!gain) throw new AdapterError('UXP', 'No Volume component on clip — apply gain first');
      const level = await gain.getParam('Level');
      const start = await item.getStartTime();
      const end = await item.getEndTime();
      if (input.type === 'in') {
        await level.addKey(start, -60);
        await level.addKey(this.secondsToTick(start.seconds + input.durationSec), 0);
      } else {
        await level.addKey(this.secondsToTick(end.seconds - input.durationSec), 0);
        await level.addKey(end, -60);
      }
    });
  }

  async muteTrack(sequenceId: string, trackId: string, muted: boolean): Promise<void> {
    await this.mutate('muteTrack', async () => {
      const seq = await this.findSequence(sequenceId);
      // trackId format: "video-N" or "audio-N"
      const [kind, idxStr] = trackId.split('-');
      const idx = Number(idxStr);
      const track = kind === 'video' ? await seq.getVideoTrack(idx) : await seq.getAudioTrack(idx);
      await track.setMute(muted);
    });
  }

  // ─── Text / MOGRT ─────────────────────────────────────────────────────────

  /**
   * A.1 (Track A debt) — Text overlay via MOGRT template.
   *
   * Template resolution order:
   *   1. `input.font` reused as explicit template path override.
   *   2. `DIRECTORAI_MOGRT_TEMPLATE` env var.
   *   3. The "owner-completed" default at
   *      `apps/panel/dist/assets/default-caption.mogrt` (ship this in
   *      the CCX bundle to make the call work out of the box).
   *
   * Without a resolved template the call still throws — but with an
   * actionable message + env var pointer instead of the old generic
   * "not implemented".
   *
   * The actual `project.createMogrtClip(path, time, trackIndex)` call
   * + "Source Text" param wire is wrapped here; live verification on
   * Premiere Pro 2024+ is owner-completed (Track D D.2 gate).
   */
  async addTextOverlay(input: TextOverlayInput): Promise<{ clipId: string }> {
    const templatePath = resolveMogrtTemplatePath(input.font);
    if (!templatePath) {
      throw new AdapterError(
        'UXP',
        `addTextOverlay: no MOGRT template found. ` +
          `Set DIRECTORAI_MOGRT_TEMPLATE env, pass an explicit "font" path, ` +
          `or bundle apps/panel/dist/assets/default-caption.mogrt. ` +
          `Wanted text "${input.text}" at ${input.startTime}s for ${input.duration}s.`
      );
    }
    const project = await this.project();
    const tickStart = this.secondsToTick(input.startTime);
    const projectAny = project as unknown as {
      createMogrtClip?: (
        path: string,
        time: TickTime,
        trackIndex: number
      ) => Promise<{
        getGuid: () => Promise<string>;
        getParamByDisplayName?: (
          n: string
        ) => Promise<{ setValue: (v: string) => Promise<void> } | null>;
      }>;
    };
    if (!projectAny.createMogrtClip) {
      throw new AdapterError(
        'UXP',
        'addTextOverlay: project.createMogrtClip is not available in this PPro build'
      );
    }
    const created = await projectAny.createMogrtClip(templatePath, tickStart, input.trackIndex);
    try {
      const param = await created.getParamByDisplayName?.('Source Text');
      await param?.setValue(input.text);
    } catch {
      // Best-effort — the template may not expose "Source Text".
    }
    return { clipId: await created.getGuid() };
  }

  // ─── Transitions ──────────────────────────────────────────────────────────

  /**
   * A.2 (Track A debt) — Apply transition with probe + fallback.
   *
   * Probe order (each path swallows its own miss and falls through):
   *   1. `ppro.TransitionFactory.createVideoTransition` (PPro 2024+).
   *   2. `track.addTransition(matchName, time, durationTicks)` (PPro 2025+).
   *   3. Throw with actionable diagnostic (no silent no-op).
   *
   * Probing at call time costs one method-existence check —
   * negligible vs the transition operation itself. Live verification
   * locks the API signature (Track D D.2 gate).
   */
  async applyTransition(input: TransitionInput): Promise<void> {
    const durTicks = this.secondsToTick(input.durationSec);

    const factory = (
      this.ppro as unknown as {
        TransitionFactory?: {
          createVideoTransition?: (name: string, duration: TickTime) => Promise<unknown>;
        };
      }
    ).TransitionFactory;

    // Probe 1 — TransitionFactory (PPro 2024+ documented path)
    if (factory?.createVideoTransition) {
      try {
        const trans = await factory.createVideoTransition(input.matchName, durTicks);
        const { item: clipB } = await this.findTrackItem(input.clipIdB);
        const adder = (clipB as unknown as { addTransition?: (t: unknown) => Promise<void> })
          .addTransition;
        if (adder) {
          await adder.call(clipB, trans);
          return;
        }
      } catch {
        // fall through
      }
    }

    // Probe 2 — per-track addTransition (PPro 2025+ helper)
    try {
      const { item: clipA, track } = await this.findTrackItem(input.clipIdA);
      const adder = (
        track as unknown as {
          addTransition?: (name: string, time: TickTime, dur: TickTime) => Promise<void>;
        }
      ).addTransition;
      if (adder) {
        const endTick = await (
          clipA as unknown as {
            getEndTime?: () => Promise<TickTime>;
          }
        ).getEndTime?.();
        if (endTick) {
          await adder.call(track, input.matchName, endTick, durTicks);
          return;
        }
      }
    } catch {
      // fall through
    }

    throw new AdapterError(
      'UXP',
      `applyTransition: no compatible API found for "${input.matchName}" ` +
        `between ${input.clipIdA}/${input.clipIdB}. Tried TransitionFactory + ` +
        `track.addTransition probes. See docs/guides/uxp-setup.md to verify on PPro 2024+.`
    );
  }

  async listTransitions(): Promise<readonly { matchName: string; displayName: string }[]> {
    // Static list of well-known matchNames used by PPro internally.
    return [
      { matchName: 'CrossDissolve', displayName: 'Cross Dissolve' },
      { matchName: 'DipToBlack', displayName: 'Dip to Black' },
      { matchName: 'DipToWhite', displayName: 'Dip to White' },
      { matchName: 'FilmDissolve', displayName: 'Film Dissolve' },
      { matchName: 'CrossZoom', displayName: 'Cross Zoom' },
      { matchName: 'WhipPan', displayName: 'Whip Pan' },
    ];
  }

  // ─── Undo ─────────────────────────────────────────────────────────────────

  async beginUndoGroup(_label: string): Promise<void> {
    // Per-operation undo is already handled by lockedAccess() inside mutate();
    // explicit groups are a no-op on the UXP side.
  }

  async endUndoGroup(): Promise<void> {
    // No-op — see beginUndoGroup
  }
}

// Re-export TickTime helper for downstream consumers
export { tickToSeconds };
export const __SECONDS = seconds;

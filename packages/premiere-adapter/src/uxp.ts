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

/**
 * C2 — Map tên chuyển cảnh thân thiện → matchName ADBE hợp lệ trên Premiere
 * 26 (lấy từ getVideoTransitionMatchNames() đã introspect). Nếu đã là tên
 * ADBE/AE thì giữ nguyên.
 */
export function mapTransitionMatchName(kind: string): string {
  const k = (kind ?? '').trim();
  if (/^(ADBE|AE\.)/i.test(k)) return k; // đã là matchName thật
  const m = k.toLowerCase();
  if (/dip.*black/.test(m)) return 'AE.ADBE Dip To Black';
  if (/dip.*white/.test(m)) return 'AE.ADBE Dip To White';
  if (/film.*dissolve/.test(m)) return 'ADBE Film Dissolve';
  if (/dissolve|cross|fade/.test(m)) return 'ADBE Additive Dissolve';
  if (/wipe/.test(m)) return 'ADBE Wipe';
  if (/push/.test(m)) return 'ADBE Push';
  if (/slide/.test(m)) return 'ADBE Slide';
  if (/zoom/.test(m)) return 'ADBE Cross Zoom';
  if (/page/.test(m)) return 'ADBE Page Turn';
  // "Cut" = không transition → vẫn trả 1 dissolve ngắn an toàn (caller quyết
  // định bỏ qua nếu kind==='cut').
  return 'ADBE Additive Dissolve';
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
  type PProCompoundAction,
  type PProAction,
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

  /**
   * S1 — Cache kết quả `listClips` theo sequenceId. Luồng dựng phim gọi
   * listClips 3 lần (activeSequenceClips → previewPlan → execMoveBatch) mà
   * KHÔNG ghi gì ở giữa → trên 413 clip là ~60s lãng phí. Cache lại, xóa khi
   * có BẤT KỲ mutation nào (invalidateClipCache) để không phục vụ dữ liệu cũ.
   */
  private clipListCache: Map<string, readonly Clip[]> | null = null;

  private invalidateClipCache(): void {
    this.clipCache = null;
    this.clipListCache = null;
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

    // Slow path. Mỗi getStartTime/getName là 1 IPC ~40ms; trên project
    // 413 clip, quét đủ = ~30s (đúng bằng timeout đã thấy). Tối ưu:
    //  (a) Nếu clipId là synthetic "video-0:tick:name" → CHỈ quét đúng
    //      track đó (bỏ qua track khác).
    //  (b) THOÁT NGAY khi tìm thấy (không index hết).
    const proj = await this.project();
    const sequences = await proj.getSequences();
    const cache = new Map<string, { item: PProTrackItem; track: PProTrack; seq: PProSequence }>();
    let found: { item: PProTrackItem; track: PProTrack; seq: PProSequence } | undefined;

    // Parse target trackId prefix (vd "video-0") nếu clipId là synthetic.
    const synMatch = /^((?:video|audio)-(\d+)):/.exec(clipId);
    const targetTrackId = synMatch?.[1] ?? null;
    const targetKind = targetTrackId
      ? targetTrackId.startsWith('video')
        ? 'video'
        : 'audio'
      : null;
    const targetIndex = synMatch?.[2] !== undefined ? Number(synMatch[2]) : null;

    /** Trả về true nếu đã tìm thấy (để caller dừng). */
    const indexItems = async (
      items: PProTrackItem[],
      track: PProTrack,
      seq: PProSequence,
      trackKind: 'video' | 'audio',
      trackIndex: number
    ): Promise<boolean> => {
      const trackId = `${trackKind}-${trackIndex}`;
      for (const it of items) {
        if (!it) continue;
        const nid = (it as { nodeId?: unknown }).nodeId;
        if (typeof nid === 'string' && nid.length > 0) {
          cache.set(nid, { item: it, track, seq });
          if (nid === clipId) {
            found = { item: it, track, seq };
            return true; // (b) thoát ngay
          }
          continue;
        }
        const startT = await it.getStartTime().catch(() => null);
        const name = await it.getName().catch(() => it.name ?? 'Untitled');
        const synthetic = `${trackId}:${String(startT?.ticks ?? '')}:${name}`;
        cache.set(synthetic, { item: it, track, seq });
        if (synthetic === clipId) {
          found = { item: it, track, seq };
          return true; // (b) thoát ngay
        }
      }
      return false;
    };

    for (const seq of sequences) {
      const vCount = await seq.getVideoTrackCount();
      for (let i = 0; i < vCount; i++) {
        // (a) bỏ qua track không khớp prefix nếu biết target.
        if (targetTrackId && !(targetKind === 'video' && targetIndex === i)) continue;
        const track = await seq.getVideoTrack(i);
        const items = await track.getTrackItems(1 /* ANY */, true);
        if (await indexItems(items, track, seq, 'video', i)) break;
      }
      if (found) break;
      const aCount = await seq.getAudioTrackCount();
      for (let i = 0; i < aCount; i++) {
        if (targetTrackId && !(targetKind === 'audio' && targetIndex === i)) continue;
        const track = await seq.getAudioTrack(i);
        const items = await track.getTrackItems(1, true);
        if (await indexItems(items, track, seq, 'audio', i)) break;
      }
      if (found) break;
    }

    // Chỉ lưu cache khi quét đầy đủ (không có target prefix) để tránh
    // cache thiếu. Khi có target prefix ta thoát sớm → cache 1 phần,
    // không gán làm cache chính.
    if (!targetTrackId) this.clipCache = cache;
    if (found) return found;
    throw new NotFoundError('Clip', clipId);
  }

  /**
   * E1 — `mutate` cũ dùng lockedAccess cho write → treo trên Premiere 26.
   * Giữ lại cho các thao tác KHÔNG-action (vd component chain) nhưng các
   * mutation chuẩn nên dùng `runTransaction` (A2) bên dưới.
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

  /**
   * A2 — Cách GHI đúng cho Premiere 26: tạo Action BÊN TRONG callback của
   * executeTransaction (pattern chuẩn Adobe DEC). `addActions` nhận
   * compoundAction; bạn gọi factory + addAction ngay trong đó.
   *
   * Bọc thêm timing log để chẩn đoán nếu treo.
   */
  private async runTransaction(
    label: string,
    addActions: (compound: PProCompoundAction) => void
  ): Promise<void> {
    const proj = await this.project();
    const t0 = Date.now();

    console.info(`[tx ${label}] executeTransaction start`);
    const ok = await proj.executeTransaction((compound: PProCompoundAction) => {
      addActions(compound);
    }, label);

    console.info(`[tx ${label}] done in ${Date.now() - t0}ms, ok=${ok}`);
    if (!ok) {
      throw new AdapterError('UXP', `${label}: executeTransaction returned false`);
    }
  }

  /**
   * A3 — "Lọc clip kém": tắt (disable) clip thay vì xoá. Clip vẫn nằm
   * trên timeline nhưng không render — an toàn, có thể bật lại. Dùng
   * createSetDisabledAction (đã verify tồn tại qua introspection).
   */
  async setClipDisabled(clipId: string, disabled: boolean): Promise<void> {
    this.invalidateClipCache();
    const { item } = await this.findTrackItem(clipId);
    await this.runTransaction(disabled ? 'Tắt clip' : 'Bật clip', (compound) => {
      compound.addAction(item.createSetDisabledAction(disabled));
    });
  }

  /**
   * SAFE-1b — Đổi tên clip theo cảnh/nội dung. Dùng createSetNameAction
   * (đã thấy tồn tại qua introspection Premiere 26). An toàn, undo được.
   */
  async renameClip(clipId: string, newName: string): Promise<void> {
    if (!newName || !newName.trim()) throw new AdapterError('UXP', 'renameClip: newName rỗng');
    this.invalidateClipCache();
    const { item } = await this.findTrackItem(clipId);
    if (typeof item.createSetNameAction !== 'function') {
      throw new AdapterError('UXP', 'renameClip: createSetNameAction không tồn tại trên host này');
    }
    await this.runTransaction('Đổi tên clip', (compound) => {
      compound.addAction(item.createSetNameAction(newName));
    });
  }

  /**
   * SAFE-1e — Tỉa in/out clip giữ NGUYÊN vị trí timeline (chỉ createSetInPoint
   * + createSetOutPoint, KHÔNG createSetStart). An toàn, không chồng lấn.
   */
  async setClipInOut(clipId: string, inSec: number, outSec: number): Promise<void> {
    if (!(outSec > inSec)) {
      throw new AdapterError('UXP', `setClipInOut: outSec (${outSec}) phải > inSec (${inSec})`);
    }
    this.invalidateClipCache();
    const { item } = await this.findTrackItem(clipId);
    if (
      typeof item.createSetInPointAction !== 'function' ||
      typeof item.createSetOutPointAction !== 'function'
    ) {
      throw new AdapterError(
        'UXP',
        'setClipInOut: thiếu createSetInPoint/OutPointAction trên host'
      );
    }
    await this.runTransaction('Tỉa in/out clip', (compound) => {
      compound.addAction(item.createSetInPointAction(this.secondsToTick(inSec)));
      compound.addAction(item.createSetOutPointAction(this.secondsToTick(outSec)));
    });
  }

  // ─── Project ──────────────────────────────────────────────────────────────

  async getProject(): Promise<Project> {
    const proj = await this.project();
    const [active, all] = await Promise.all([proj.getActiveSequence(), proj.getSequences()]);
    const sequences: Sequence[] = [];
    for (const s of all) sequences.push(await translateSequence(s, this.ppro));
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
    for (const s of all) out.push(await translateSequence(s, this.ppro));
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
    return translateSequence(s, this.ppro);
  }

  // ─── Timeline read ────────────────────────────────────────────────────────

  async listClips(sequenceId: string): Promise<readonly Clip[]> {
    // S1 — phục vụ từ cache nếu chưa có mutation nào kể từ lần quét trước.
    const cached = this.clipListCache?.get(sequenceId);
    if (cached) return cached;

    const seq = await this.findSequence(sequenceId);
    const out: Clip[] = [];
    const vCount = await seq.getVideoTrackCount();
    for (let i = 0; i < vCount; i++) {
      const t = await seq.getVideoTrack(i);
      const items = await t.getTrackItems(1, false);
      for (const it of items)
        out.push(await translateTrackItem(it, `video-${i}`, 'video', this.ppro));
    }
    const aCount = await seq.getAudioTrackCount();
    for (let i = 0; i < aCount; i++) {
      const t = await seq.getAudioTrack(i);
      const items = await t.getTrackItems(1, false);
      for (const it of items)
        out.push(await translateTrackItem(it, `audio-${i}`, 'audio', this.ppro));
    }
    const frozen = Object.freeze(out);
    (this.clipListCache ??= new Map()).set(sequenceId, frozen);
    return frozen;
  }

  async getClip(clipId: string): Promise<Clip | null> {
    try {
      const { item, track } = await this.findTrackItem(clipId);
      const mediaType = await track.getMediaType().catch(() => 'Video');
      const kind: Clip['kind'] = mediaType === 'Video' ? 'video' : 'audio';
      return translateTrackItem(item, `${kind}-${track.id}`, kind, this.ppro);
    } catch {
      return null;
    }
  }

  async listTracks(sequenceId: string): Promise<readonly Track[]> {
    const seq = await translateSequence(await this.findSequence(sequenceId), this.ppro);
    return seq.tracks;
  }

  // ─── Timeline edit ────────────────────────────────────────────────────────

  /**
   * A3 — Premiere 26 UXP KHÔNG có action "split / cắt đôi clip". Không thể
   * tách 1 clip thành 2 qua API hiện tại. Báo lỗi rõ ràng để Director
   * tránh dùng tool này, gợi ý dùng trim hoặc xuất FCPXML (N4).
   */
  async cutClip(_input: CutClipInput): Promise<readonly Clip[]> {
    throw new AdapterError(
      'UXP',
      'Premiere 26 chưa hỗ trợ cắt-đôi clip qua UXP (không có split action). ' +
        'Dùng timeline.trimClip để tỉa, hoặc xuất FCPXML để cắt sẵn.'
    );
  }

  /**
   * A3 — Tỉa clip dùng Action factory (createSetInPoint/Start/OutPoint).
   * Thay thế hoàn toàn cách gọi item.setInPoint() trực tiếp (treo trên 26).
   */
  async trimClip(input: TrimClipInput): Promise<Clip> {
    this.invalidateClipCache();
    const { item, track } = await this.findTrackItem(input.clipId);
    const inT = await item.getInPoint();
    const startT = await item.getStartTime();
    const delta = input.newRange.start - startT.seconds;
    const dur = input.newRange.end - input.newRange.start;
    await this.runTransaction('Tỉa clip', (compound) => {
      compound.addAction(item.createSetInPointAction(this.secondsToTick(inT.seconds + delta)));
      compound.addAction(item.createSetStartAction(this.secondsToTick(input.newRange.start)));
      compound.addAction(
        item.createSetOutPointAction(this.secondsToTick(inT.seconds + delta + dur))
      );
    });
    const mt = await track.getMediaType();
    const k: Clip['kind'] = mt === 'Video' ? 'video' : 'audio';
    return translateTrackItem(item, `${k}-${track.id}`, k, this.ppro);
  }

  /**
   * A3 — Di chuyển clip tới VỊ TRÍ TUYỆT ĐỐI `newStart` (giây), GIỮ NGUYÊN in/out.
   *
   * BUG-FIX (PPro26): `createMoveAction(time)` dời clip THEO OFFSET (tương đối,
   * GIỮ in/out) — đúng để "move". Lỗi cũ: truyền `newStart` (tuyệt đối) làm
   * offset → cộng dồn sai. `createSetStartAction` thì KHÔNG dùng được vì nó
   * SLIP in-point (đổi start kéo theo source in → hỏng in/out). Đúng nhất:
   * createMoveAction với DELTA = newStart − startHiệnTại.
   */
  async moveClip(input: MoveClipInput): Promise<Clip> {
    this.invalidateClipCache();
    const { item, track } = await this.findTrackItem(input.clipId);
    if (input.newTrackId) {
      throw new AdapterError('UXP', 'Premiere 26 UXP chưa hỗ trợ chuyển clip sang track khác');
    }
    const startT = await item.getStartTime();
    const delta = input.newStart - startT.seconds;
    await this.runTransaction('Di chuyển clip', (compound) => {
      compound.addAction(item.createMoveAction(this.secondsToTick(delta)));
    });
    const mt = await track.getMediaType();
    const k: Clip['kind'] = mt === 'Video' ? 'video' : 'audio';
    return translateTrackItem(item, `${k}-${track.id}`, k, this.ppro);
  }

  /**
   * A3 — Premiere 26 không có hard-delete action. Chuyển sang SOFT-DELETE:
   * tắt clip (disable) — clip vẫn trên timeline nhưng không render. Đây là
   * cách "xoá an toàn" duy nhất khả thi, và phù hợp use case "lọc clip kém"
   * (có thể bật lại). Để xoá hẳn, người dùng tự chọn + Delete trong Premiere.
   */
  async deleteClip(clipId: string): Promise<void> {
    await this.setClipDisabled(clipId, true);
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
  /**
   * C3 — Đảm bảo có Lumetri component trên clip, dùng API ĐÃ INTROSPECT:
   *   getComponentChain → getComponentCount/getComponentAtIndex (tìm)
   *   VideoFilterFactory.createComponent("AE.ADBE Lumetri") (tạo)
   *   chain.createAppendComponentAction(comp) qua executeTransaction (gắn)
   * Thay HOÀN TOÀN đường cũ `Component.create`/`insertComponent` (treo trên 26).
   */
  private async ensureLumetri(item: PProTrackItem): Promise<{ chain: unknown; comp: unknown }> {
    const chain = (await item.getComponentChain()) as {
      getComponentCount?: () => Promise<number>;
      getComponentAtIndex?: (i: number) => Promise<unknown>;
      createAppendComponentAction?: (c: unknown) => PProAction;
    };
    const count = (await chain.getComponentCount?.()) ?? 0;
    for (let i = 0; i < count; i++) {
      const c = (await chain.getComponentAtIndex?.(i)) as {
        getMatchName?: () => Promise<string>;
      } | null;
      const mn = (await c?.getMatchName?.()) ?? '';
      if (mn.toLowerCase().includes('lumetri')) return { chain, comp: c };
    }
    const factory = (
      this.ppro as unknown as {
        VideoFilterFactory?: { createComponent?: (n: string) => Promise<unknown> };
      }
    ).VideoFilterFactory;
    if (!factory?.createComponent || typeof chain.createAppendComponentAction !== 'function') {
      throw new AdapterError(
        'UXP',
        'C3: thiếu VideoFilterFactory/createAppendComponentAction trên host'
      );
    }
    const comp = await factory.createComponent('AE.ADBE Lumetri');
    this.invalidateClipCache();
    await this.runTransaction('Thêm Lumetri', (compound) => {
      compound.addAction(chain.createAppendComponentAction!(comp));
    });
    return { chain, comp };
  }

  async applyColorPreset(clipId: string, presetName: string): Promise<void> {
    const recipe = getLumetriRecipe(presetName);
    if (!recipe) {
      throw new AdapterError(
        'UXP',
        `Unknown Lumetri preset "${presetName}". Valid keys: ${LUMETRI_PRESET_KEYS.join(', ')}`
      );
    }
    await this.setColorParams({ clipId, ...recipe });
  }

  async setColorParams(input: ColorParamsInput): Promise<void> {
    const { item } = await this.findTrackItem(input.clipId);
    const { comp } = await this.ensureLumetri(item);
    const lumetri = comp as {
      getParamCount?: () => Promise<number>;
      getParam?: (i: number) => Promise<unknown>;
    };
    // Map giá trị mong muốn theo tên slider (khớp displayName, không phân biệt hoa/thường).
    const wanted: Record<string, number | undefined> = {
      exposure: input.exposure,
      contrast: input.contrast,
      highlights: input.highlights,
      shadows: input.shadows,
      whites: input.whites,
      blacks: input.blacks,
      saturation: input.saturation,
      vibrance: input.vibrance,
      temperature: input.temperature,
    };
    const pc = (await lumetri.getParamCount?.()) ?? 0;
    const actions: PProAction[] = [];
    for (let i = 0; i < pc; i++) {
      const param = (await lumetri.getParam?.(i)) as {
        getDisplayName?: () => Promise<string>;
        createKeyframe?: (v: number) => Promise<unknown> | unknown;
        createSetValueAction?: (kf: unknown) => PProAction;
      } | null;
      if (!param?.createSetValueAction || !param.createKeyframe) continue;
      const dn = ((await param.getDisplayName?.()) ?? '').toLowerCase();
      // Khớp tên: "exposure", "color temperature"→temperature, …
      const key = Object.keys(wanted).find(
        (k) => wanted[k] !== undefined && (dn === k || dn.includes(k))
      );
      if (!key) continue;
      try {
        const kf = await param.createKeyframe(wanted[key] as number);
        actions.push(param.createSetValueAction(kf));
      } catch {
        // bỏ qua param không set được
      }
    }
    if (actions.length > 0) {
      this.invalidateClipCache();
      await this.runTransaction('Sửa màu Lumetri', (compound) => {
        for (const a of actions) compound.addAction(a);
      });
    }
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
    const matchName = mapTransitionMatchName(input.matchName);

    // C2 — Action model (signature ĐÃ INTROSPECT thật trên Premiere 26):
    //   createVideoTransition(matchName)  // 1 arg
    //   AddTransitionOptions: setDuration / setApplyToStart / setTransitionAlignment
    //   item.createAddVideoTransitionAction(trans, options)  → executeTransaction
    // Nuốt lỗi để rơi xuống probe cũ nếu host khác.
    try {
      const pp = this.ppro as unknown as {
        TransitionFactory?: { createVideoTransition?: (name: string) => unknown };
        AddTransitionOptions?: new () => {
          setDuration?: (t: TickTime) => void;
          setApplyToStart?: (b: boolean) => void;
        };
      };
      const tf = pp.TransitionFactory;
      const { item } = await this.findTrackItem(input.clipIdB);
      if (tf?.createVideoTransition && typeof item.createAddVideoTransitionAction === 'function') {
        const trans = await tf.createVideoTransition(matchName);
        const options = pp.AddTransitionOptions ? new pp.AddTransitionOptions() : undefined;
        if (options) {
          try {
            options.setDuration?.(durTicks);
            // Áp ở ĐẦU clip B → chuyển cảnh giữa clip trước và clip B.
            options.setApplyToStart?.(true);
          } catch {
            /* setters tuỳ chọn */
          }
        }
        this.invalidateClipCache();
        await this.runTransaction('Thêm chuyển cảnh', (compound) => {
          const make = item.createAddVideoTransitionAction!;
          const act = options !== undefined ? make(trans, options) : make(trans);
          compound.addAction(act);
        });
        return;
      }
    } catch {
      // fall through to legacy probes
    }

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

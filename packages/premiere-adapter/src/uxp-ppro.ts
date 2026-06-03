import { AdapterError } from '@directorai/shared';

/**
 * Adobe Premiere Pro UXP `premierepro` module types — partial,
 * covering only the surface we actually call. Sourced from Adobe UXP
 * Premiere Pro Developer docs (apiVersion 2).
 */

export interface TickTime {
  readonly seconds: number;
  readonly ticks: string;
  readonly ticksNumber: number;
}

export interface TickTimeStatic {
  createWithSeconds(s: number): TickTime;
  createWithTicks(ticks: string): TickTime;
  readonly TIME_ZERO: TickTime;
}

export interface PProProjectItem {
  readonly name: string;
  readonly id: string;
  // PATH-FIX: `getMediaFilePath` KHÔNG có trên ProjectItem thô (xác minh live:
  // projItemMembers không chứa nó). Phải cast sang ClipProjectItem. Để optional
  // để type không dối, nhưng đường lấy path đúng là qua PProClipProjectItem.
  getMediaFilePath?(): Promise<string> | string;
  getDuration(): Promise<TickTime>;
  getProjectItems(): Promise<PProProjectItem[]>;
}

/**
 * PATH-FIX — `ClipProjectItem` là lớp con của ProjectItem; CHỈ nó mới có
 * `getMediaFilePath()` (theo tài liệu Adobe UXP, minversion 25.0). Trả về
 * đường dẫn TUYỆT ĐỐI, ĐỒNG BỘ (không await). Lấy bằng cách
 * `ppro.ClipProjectItem.cast(projectItem)`.
 */
export interface PProClipProjectItem extends PProProjectItem {
  getMediaFilePath(): string;
  getOriginatingProjectPath?(): string;
}

export interface PProClipProjectItemStatic {
  /** Cast 1 ProjectItem thô → ClipProjectItem (null nếu không phải clip). */
  cast(item: PProProjectItem): PProClipProjectItem | null;
}

export interface PProComponentParam {
  readonly displayName: string;
  setValue(value: number | string | boolean, updateUI: boolean): Promise<boolean>;
  getValue(): Promise<number | string | boolean>;
  addKey(time: TickTime, value: number | string | boolean): Promise<boolean>;
}

export interface PProComponent {
  readonly matchName: string;
  readonly displayName: string;
  getParam(name: string): Promise<PProComponentParam>;
  getParams(): Promise<PProComponentParam[]>;
}

export interface PProComponentChain {
  getComponents(): Promise<PProComponent[]>;
  insertComponent(component: PProComponent, position: number): Promise<boolean>;
  removeComponent(component: PProComponent): Promise<boolean>;
  getComponentCount(): Promise<number>;
  getComponentAtIndex(index: number): Promise<PProComponent>;
}

export interface PProTrackItem {
  readonly nodeId: string;
  readonly name: string;
  getName(): Promise<string>;
  getStartTime(): Promise<TickTime>;
  getEndTime(): Promise<TickTime>;
  getInPoint(): Promise<TickTime>;
  getOutPoint(): Promise<TickTime>;
  getDuration(): Promise<TickTime>;
  getMediaType(): Promise<string>;
  getProjectItem(): Promise<PProProjectItem | null>;
  getComponentChain(): Promise<PProComponentChain>;
  isDisabled(): Promise<boolean>;

  // ─── A1 — Action factories (Premiere 26 edit model) ──────────────────
  // Các method dưới đây trả về 1 PProAction; phải đưa vào compoundAction
  // bên trong project.executeTransaction để thực sự áp dụng.
  createSetDisabledAction(disabled: boolean): PProAction;
  createSetInPointAction(time: TickTime): PProAction;
  createSetOutPointAction(time: TickTime): PProAction;
  createSetStartAction(time: TickTime): PProAction;
  createSetEndAction(time: TickTime): PProAction;
  createSetNameAction(name: string): PProAction;
  createMoveAction(time: TickTime): PProAction;
  createAddVideoTransitionAction?(...args: unknown[]): PProAction;
  createRemoveVideoTransitionAction?(...args: unknown[]): PProAction;

  // ─── Legacy direct-mutation (KHÔNG hoạt động trên Premiere 26) ───────
  // Giữ optional để code cũ + mock vẫn compile; uxp.ts không dùng nữa.
  move?(time: TickTime): Promise<boolean>;
  remove?(rippleEdit: boolean, alignToVideo: boolean): Promise<boolean>;
  setInPoint?(time: TickTime): Promise<boolean>;
  setOutPoint?(time: TickTime): Promise<boolean>;
  setStartTime?(time: TickTime): Promise<boolean>;
  setDisabled?(disabled: boolean): Promise<boolean>;
}

export interface PProTrack {
  readonly id: number;
  readonly name: string;
  getMediaType(): Promise<string>;
  getTrackItems(typeFilter: number, includeDisabled: boolean): Promise<PProTrackItem[]>;
  isMuted(): Promise<boolean>;
  setMute(muted: boolean): Promise<boolean>;
  isLocked(): Promise<boolean>;
  insertClip(projectItem: PProProjectItem, time: TickTime): Promise<boolean>;
}

export interface PProMarker {
  readonly guid: string;
  readonly name: string;
  readonly comment: string;
  readonly color: string;
  readonly type: string;
  getStartTime(): Promise<TickTime>;
  getDuration(): Promise<TickTime>;
  setName(name: string): Promise<boolean>;
  setComment(comment: string): Promise<boolean>;
  setColor(color: string): Promise<boolean>;
}

export interface PProMarkerCollection {
  createMarker(time: TickTime, name: string, color?: string, type?: string): Promise<PProMarker>;
  getMarkers(): Promise<PProMarker[]>;
  removeMarker(marker: PProMarker): Promise<boolean>;
}

export interface PProSequence {
  readonly guid: string;
  readonly name: string;
  readonly markers: PProMarkerCollection;
  getName(): Promise<string>;
  getEndTime(): Promise<TickTime>;
  getInPoint(): Promise<TickTime>;
  getOutPoint(): Promise<TickTime>;
  getPlayerPosition(): Promise<TickTime>;
  getVideoTrackCount(): Promise<number>;
  getAudioTrackCount(): Promise<number>;
  getVideoTrack(index: number): Promise<PProTrack>;
  getAudioTrack(index: number): Promise<PProTrack>;
  getSettings(): Promise<PProSequenceSettings>;
}

export interface PProSequenceSettings {
  readonly videoFrameWidth: number;
  readonly videoFrameHeight: number;
  readonly videoFrameRate: TickTime;
  readonly audioSampleRate: number;
}

export interface PProProject {
  readonly name: string;
  readonly path: string;
  readonly guid: string;
  getActiveSequence(): Promise<PProSequence | null>;
  getSequences(): Promise<PProSequence[]>;
  setActiveSequence(sequence: PProSequence): Promise<boolean>;
  getRootItem(): Promise<PProProjectItem>;
  importFiles(
    filePaths: readonly string[],
    suppressUI: boolean,
    targetBin: PProProjectItem,
    asNumberedStill: boolean
  ): Promise<boolean>;
  lockedAccess<T>(action: () => Promise<T> | T): Promise<T>;
  /**
   * A1 — Premiere 26 dùng mô hình Transaction + Action cho mọi edit.
   * Callback nhận một CompoundAction; bạn tạo action qua các factory
   * `createXxxAction` trên trackItem/sequence rồi addAction vào.
   */
  executeTransaction(
    action: (compoundAction: PProCompoundAction) => void,
    label?: string
  ): Promise<boolean>;
  createBin(name: string, parent?: PProProjectItem): Promise<PProProjectItem>;
}

/** A1 — Một edit nguyên tử (vd kết quả của createSetOutPointAction). */
export interface PProAction {
  readonly __action?: true;
}

/** A1 — Gom nhiều Action thành 1 transaction (1 undo step). */
export interface PProCompoundAction {
  addAction(action: PProAction): void;
}

export interface PProProjectStatic {
  getActiveProject(): Promise<PProProject | null>;
}

export interface PProMediaType {
  readonly VIDEO: number;
  readonly AUDIO: number;
  readonly ANY: number;
}

export interface PProMarkerType {
  readonly COMMENT: string;
  readonly CHAPTER: string;
  readonly SEGMENTATION: string;
  readonly WEB: string;
}

export interface PProEncoderManager {
  encodeSequence(
    sequence: PProSequence,
    outputPath: string,
    presetPath: string,
    removeOnCompletion: boolean,
    workArea: number
  ): Promise<string>;
  startBatch(): Promise<boolean>;
}

export interface PProModule {
  readonly Project: PProProjectStatic;
  readonly TickTime: TickTimeStatic;
  readonly MediaType: PProMediaType;
  readonly MarkerType: PProMarkerType;
  readonly EncoderManager?: PProEncoderManager;
  // PATH-FIX — static để cast ProjectItem → ClipProjectItem (lấy path đầy đủ).
  readonly ClipProjectItem?: PProClipProjectItemStatic;
  // Component factories
  Component?: { create(matchName: string): Promise<PProComponent> };
}

/**
 * Lazily resolve the `premierepro` module from the UXP host.
 * Throws AdapterError when called outside the UXP runtime.
 */
export function requirePProModule(): PProModule {
  const req = (globalThis as { require?: (m: string) => unknown }).require;
  if (typeof req !== 'function') {
    throw new AdapterError('UXP', 'globalThis.require is not available — not running in UXP');
  }
  try {
    const mod = req('premierepro') as PProModule | undefined;
    if (!mod || !mod.Project || !mod.TickTime) {
      throw new AdapterError('UXP', 'premierepro module loaded but surface incomplete');
    }
    return mod;
  } catch (err) {
    throw new AdapterError('UXP', 'Failed to load premierepro module', err);
  }
}

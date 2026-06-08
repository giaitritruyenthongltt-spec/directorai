/**
 * Thin wrapper around UXP premierepro API.
 * Only runs inside the UXP plugin context.
 * Used by the panel to get real Premiere state without going through the server.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

// UXP injects 'premierepro' via require() — type-cast as any
const ppro: any =
  typeof require === 'function'
    ? (() => {
        try {
          return require('premierepro');
        } catch {
          return null;
        }
      })()
    : null;

export const isInUXP = ppro !== null;

export function getProjectName(): string {
  if (!ppro) return '(mock — not in UXP)';
  const proj = ppro.getActiveProject?.();
  return proj?.name ?? 'No project';
}

/**
 * UI8 — Đọc độ sáng theme của host (Premiere) để panel đồng bộ. UXP lộ theme
 * qua vài đường khác nhau tùy phiên bản; thử lần lượt, trả 'light'|'dark'|null.
 */
export function getHostTheme(): 'light' | 'dark' | null {
  try {
    // (a) UXP host theme (một số bản: require('uxp').host.uiTheme / theme).
    const uxp =
      typeof require === 'function'
        ? (() => {
            try {
              return require('uxp');
            } catch {
              return null;
            }
          })()
        : null;
    const raw =
      uxp?.host?.uiTheme ??
      uxp?.host?.theme ??
      (typeof document !== 'undefined'
        ? getComputedStyle(document.body).getPropertyValue('--uxp-host-theme')
        : '');
    const s = String(raw ?? '').toLowerCase();
    if (s.includes('light')) return 'light';
    if (s.includes('dark')) return 'dark';
    // (b) prefers-color-scheme (UXP/CEF có thể honor).
    if (typeof window !== 'undefined' && window.matchMedia) {
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    }
  } catch {
    // bỏ qua — không chặn render
  }
  return null;
}

export function getActiveSequenceName(): string {
  if (!ppro) return '(mock)';
  const proj = ppro.getActiveProject?.();
  const seq = proj?.getActiveSequence?.();
  return seq?.name ?? 'No sequence';
}

/**
 * D5 — Đọc THẲNG active project + sequence từ UXP trong panel (không qua
 * server). Premiere 26 trả Promise nên phải await; bản sync ở trên luôn cho
 * "No project". Dùng đúng `Project.getActiveProject()` như adapter. Trả null
 * khi không ở UXP (caller sẽ fallback sang WS hoặc hiện "giả lập").
 */
export async function readActiveContext(): Promise<{
  project: string;
  sequence: string;
} | null> {
  if (!ppro) return null;
  let project = 'Chưa có dự án';
  let sequence = 'Chưa có sequence';
  try {
    const proj = await ppro.Project?.getActiveProject?.();
    if (proj) {
      project = proj.name ?? project;
      const seq = await proj.getActiveSequence?.();
      if (seq) sequence = seq.name ?? sequence;
    }
  } catch {
    return null;
  }
  return { project, sequence };
}

export async function evalExtendScript(script: string): Promise<string> {
  if (!ppro) return `[mock] would eval: ${script}`;
  // ppro.evaluateExtendScript is available in some versions
  const result = await ppro.evaluateExtendScript?.(script);
  return String(result);
}

/**
 * A1 — Liệt kê toàn bộ tên method/property của một object UXP, kể cả
 * trên prototype chain (UXP objects để method trên prototype). Dùng để
 * khám phá API thật của Premiere 26 lúc chạy.
 */
function listMembers(obj: unknown): string[] {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return [];
  const seen = new Set<string>();
  let cur: object | null = obj as object;
  let depth = 0;
  while (cur && cur !== Object.prototype && depth < 6) {
    for (const k of Object.getOwnPropertyNames(cur)) {
      if (k === 'constructor') continue;
      seen.add(k);
    }
    cur = Object.getPrototypeOf(cur) as object | null;
    depth++;
  }
  return [...seen].sort();
}

/** Lọc các member là "action factory" (create*Action / *Action). */
function actionFactories(members: string[]): string[] {
  return members.filter((m) => /action/i.test(m));
}

/**
 * A1 — Dump API surface thật của Premiere 26. Gọi qua RPC _debug.introspect.
 * Trả về cây method của: module, project, sequence, track, trackItem,
 * cùng danh sách action-factory tìm được ở mỗi cấp.
 */
export async function introspectPremiereApi(): Promise<Record<string, unknown>> {
  if (!ppro) return { error: 'not in UXP' };
  const out: Record<string, unknown> = {};

  out.module = listMembers(ppro);
  out.moduleActions = actionFactories(out.module as string[]);

  // Project
  const proj = await ppro.Project?.getActiveProject?.();
  if (!proj) {
    out.note = 'no active project';
    return out;
  }
  const projMembers = listMembers(proj);
  out.project = projMembers;
  out.projectActions = actionFactories(projMembers);

  // Sequence
  const seq = await proj.getActiveSequence?.();
  if (seq) {
    const seqMembers = listMembers(seq);
    out.sequence = seqMembers;
    out.sequenceActions = actionFactories(seqMembers);

    // First video track + first track item
    try {
      const vCount = await seq.getVideoTrackCount?.();
      if (vCount && vCount > 0) {
        const track = await seq.getVideoTrack?.(0);
        if (track) {
          const trackMembers = listMembers(track);
          out.track = trackMembers;
          out.trackActions = actionFactories(trackMembers);

          const items = await track.getTrackItems?.(1, false);
          if (items && items.length > 0) {
            const item = items[0];
            const itemMembers = listMembers(item);
            out.trackItem = itemMembers;
            out.trackItemActions = actionFactories(itemMembers);

            // ProjectItem of that clip
            try {
              const pi = await item.getProjectItem?.();
              if (pi) {
                const piMembers = listMembers(pi);
                out.projectItem = piMembers;
                out.projectItemActions = actionFactories(piMembers);
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (e) {
      out.trackError = e instanceof Error ? e.message : String(e);
    }

    // Markers object
    try {
      const markers = (seq as { markers?: unknown }).markers;
      if (markers) {
        const mMembers = listMembers(markers);
        out.markers = mMembers;
        out.markersActions = actionFactories(mMembers);
      }
    } catch {
      // skip
    }
  } else {
    out.note = 'no active sequence';
  }

  // B8/B9 — deep-dump color + transition factories (static class members).
  const pp = ppro as Record<string, unknown>;
  const dumpStatic = (name: string): void => {
    try {
      const cls = pp[name];
      if (cls) out[`static_${name}`] = listMembers(cls);
    } catch (e) {
      out[`static_${name}_err`] = e instanceof Error ? e.message : String(e);
    }
  };
  for (const n of [
    'TransitionFactory',
    'AddTransitionOptions',
    'VideoTransition',
    'VideoFilterFactory',
    'VideoComponentChain',
    'VideoFilterComponent',
    'Color',
    'ComponentFactory',
    'Markers',
    'Marker',
    'MarkerType',
    // ADJ-LAYER spike — tìm API tạo/chèn adjustment layer.
    'SequenceEditor',
    'ProjectUtils',
    'SequenceUtils',
    'ProjectItem',
    'ClipProjectItem',
    'FolderItem',
    'Project',
  ]) {
    dumpStatic(n);
  }
  // ADJ-LAYER — quét MỌI member toàn module có chữ 'adjust' (bất kể hoa thường).
  try {
    const all = listMembers(ppro);
    out.adjustLikeModule = all.filter((m) => /adjust/i.test(String(m)));
    // Dò sâu instance SequenceEditor nếu tạo được từ sequence đang mở.
    const proj2 = await ppro.Project?.getActiveProject?.();
    const seq2 = await proj2?.getActiveSequence?.();
    const SeqEd = (ppro as Record<string, unknown>).SequenceEditor as
      | { getEditor?: (s: unknown) => unknown }
      | (new (s: unknown) => unknown)
      | undefined;
    if (SeqEd && seq2) {
      let inst: unknown;
      try {
        const getEd = (SeqEd as { getEditor?: (s: unknown) => unknown }).getEditor;
        inst = getEd ? getEd.call(SeqEd, seq2) : new (SeqEd as new (s: unknown) => unknown)(seq2);
      } catch (e) {
        out.seqEditorCtorErr = e instanceof Error ? e.message : String(e);
      }
      if (inst) out.seqEditorInstance = listMembers(inst);
    }
  } catch (e) {
    out.adjustProbeErr = e instanceof Error ? e.message : String(e);
  }

  // C11 — Markers PPro26: KHÔNG ở seq.markers. Dò pattern truy cập đúng.
  try {
    const Markers = pp.Markers as Record<string, (arg: unknown) => unknown> | undefined;
    const seqM = await proj.getActiveSequence?.();
    if (Markers && seqM) {
      for (const fn of ['getMarkers', 'getMarkersForSequence', 'create', 'getMarker']) {
        try {
          const ms = await Markers[fn]?.(seqM);
          out[`Markers_${fn}_seq`] = Array.isArray(ms)
            ? `array len=${ms.length}`
            : ms === undefined
              ? 'undefined'
              : typeof ms;
          if (Array.isArray(ms) && ms.length > 0) out.markerInstance = listMembers(ms[0]);
        } catch (e) {
          out[`Markers_${fn}_err`] = e instanceof Error ? e.message : String(e);
        }
      }
      // PPro26: new ppro.Markers(seq) → instance dùng action model.
      try {
        const inst = new (pp.Markers as new (s: unknown) => Record<string, unknown>)(seqM);
        out.Markers_instance = listMembers(inst);
        const addFn = inst.createAddMarkerAction as { length?: number } | undefined;
        const rmFn = inst.createRemoveMarkerAction as { length?: number } | undefined;
        out.addMarkerArity = addFn?.length ?? null;
        out.removeMarkerArity = rmFn?.length ?? null;
        const getFn = inst.getMarkers as (() => unknown) | undefined;
        const ms = await getFn?.call(inst);
        out.getMarkersType = Array.isArray(ms) ? `array len=${ms.length}` : typeof ms;
        if (Array.isArray(ms) && ms.length > 0) out.existingMarker = listMembers(ms[0]);
      } catch (e) {
        out.Markers_ctor_err = e instanceof Error ? e.message : String(e);
      }
      // Marker class: constructable? dump instance members.
      try {
        const inst2 = new (pp.Marker as new () => unknown)();
        out.Marker_newInstance = listMembers(inst2);
      } catch (e) {
        out.Marker_ctor_err = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    out.markersProbeErr = e instanceof Error ? e.message : String(e);
  }

  // getComponentChain() of the first track item → chain + first component members.
  try {
    const seq2 = await proj.getActiveSequence?.();
    const track = await seq2?.getVideoTrack?.(0);
    const items = await track?.getTrackItems?.(1, false);
    const item = items?.[0];
    const chain = await (
      item as { getComponentChain?: () => Promise<unknown> }
    )?.getComponentChain?.();
    if (chain) {
      out.componentChain = listMembers(chain);
      const count = await (
        chain as { getComponentCount?: () => Promise<number> }
      ).getComponentCount?.();
      out.componentCount = count ?? null;
      if (count && count > 0) {
        const comp = await (
          chain as { getComponentAtIndex?: (i: number) => Promise<unknown> }
        ).getComponentAtIndex?.(0);
        if (comp) {
          out.firstComponent = listMembers(comp);
          // C2/C3 — param API của component (để set exposure/màu).
          try {
            const c = comp as {
              getMatchName?: () => Promise<string>;
              getParamCount?: () => Promise<number>;
              getParam?: (i: number) => Promise<unknown>;
            };
            out.firstComponentMatchName = await c.getMatchName?.();
            const pc = await c.getParamCount?.();
            out.firstComponentParamCount = pc ?? null;
            if (pc && pc > 0) {
              const param = await c.getParam?.(0);
              if (param) {
                out.firstParam = listMembers(param);
                out.firstParamName = await (
                  param as { getDisplayName?: () => Promise<string> }
                ).getDisplayName?.();
              }
            }
          } catch (e) {
            out.paramErr = e instanceof Error ? e.message : String(e);
          }
        }
      }
    }
  } catch (e) {
    out.componentChainErr = e instanceof Error ? e.message : String(e);
  }

  // C2/C3 — danh sách matchName hợp lệ + AddTransitionOptions instance.
  try {
    const tf = pp.TransitionFactory as {
      getVideoTransitionMatchNames?: () => Promise<string[]>;
    };
    out.transitionMatchNames = (await tf?.getVideoTransitionMatchNames?.())?.slice(0, 40);
  } catch (e) {
    out.transitionMatchNamesErr = e instanceof Error ? e.message : String(e);
  }
  try {
    const vff = pp.VideoFilterFactory as {
      getMatchNames?: () => Promise<string[]>;
      getDisplayNames?: () => Promise<string[]>;
    };
    const names = (await vff?.getMatchNames?.()) ?? [];
    const disp = (await vff?.getDisplayNames?.()) ?? [];
    // Lọc các filter liên quan màu (Lumetri/Color) để dễ tìm.
    out.filterColorMatchNames = names.filter((n) => /lumetri|color|colour/i.test(String(n)));
    out.filterColorDisplayNames = disp.filter((n) => /lumetri|color|colour/i.test(String(n)));
    out.filterCount = names.length;
  } catch (e) {
    out.filterMatchNamesErr = e instanceof Error ? e.message : String(e);
  }
  try {
    const AddTO = pp.AddTransitionOptions as (new () => unknown) | undefined;
    if (AddTO) out.addTransitionOptionsInstance = listMembers(new AddTO());
  } catch (e) {
    out.addTransitionOptionsErr = e instanceof Error ? e.message : String(e);
  }

  // ĐƯỜNG DẪN FILE — chẩn đoán giá trị THẬT từng accessor trên 1 clip thật.
  // Quyết định liệu plugin có TỰ lấy được path (khỏi nhập tay) hay không.
  try {
    const seqP = await proj.getActiveSequence?.();
    const trk = await seqP?.getVideoTrack?.(0);
    const its = await trk?.getTrackItems?.(1, false);
    const it0 = its?.[0];
    const pji = await (it0 as { getProjectItem?: () => Promise<unknown> })?.getProjectItem?.();
    if (pji) {
      const pi = pji as Record<string, unknown> & {
        name?: string;
        getMediaFilePath?: () => Promise<string> | string;
        getMediaPath?: () => Promise<string> | string;
        getFilePath?: () => Promise<string> | string;
      };
      out.projItemName = pi.name;
      out.projItemMembers = listMembers(pji);
      const tryRaw = async (label: string, fn?: () => Promise<string> | string): Promise<void> => {
        if (typeof fn !== 'function') {
          out[`path_${label}`] = '(no method)';
          return;
        }
        try {
          out[`path_${label}`] = await fn();
        } catch (e) {
          out[`path_${label}`] = `ERR: ${e instanceof Error ? e.message : String(e)}`;
        }
      };
      await tryRaw('getMediaFilePath', pi.getMediaFilePath?.bind(pi));
      await tryRaw('getMediaPath', pi.getMediaPath?.bind(pi));
      await tryRaw('getFilePath', pi.getFilePath?.bind(pi));
      out.path_mediaFilePath_prop = (pi as { mediaFilePath?: unknown }).mediaFilePath ?? '(none)';

      // PATH-FIX — đường ĐÚNG: cast ProjectItem → ClipProjectItem rồi gọi
      // getMediaFilePath() (sync). Đây là cái ta kỳ vọng trả FULL PATH.
      try {
        const CPI = pp.ClipProjectItem as { cast?: (it: unknown) => unknown } | undefined;
        out.has_ClipProjectItem_cast = typeof CPI?.cast === 'function';
        const clip = CPI?.cast?.(pji) as
          | { getMediaFilePath?: () => unknown; getMembers?: unknown }
          | null
          | undefined;
        out.cast_ok = !!clip;
        if (clip) {
          out.cast_members = listMembers(clip);
          out.cast_getMediaFilePath = clip.getMediaFilePath?.();
        }
      } catch (e) {
        out.castErr = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    out.pathDiagErr = e instanceof Error ? e.message : String(e);
  }

  // C3 — tạo (chưa gắn) 1 Lumetri component để dump tên param (displayName).
  try {
    const vff = pp.VideoFilterFactory as {
      createComponent?: (n: string) => Promise<unknown>;
    };
    const lum = await vff?.createComponent?.('AE.ADBE Lumetri');
    if (lum) {
      const c = lum as {
        getParamCount?: () => Promise<number>;
        getParam?: (i: number) => Promise<unknown>;
      };
      const pcount = (await c.getParamCount?.()) ?? 0;
      out.lumetriParamCount = pcount;
      const names: string[] = [];
      for (let i = 0; i < Math.min(pcount, 60); i++) {
        const param = (await c.getParam?.(i)) as { getDisplayName?: () => Promise<string> } | null;
        names.push((await param?.getDisplayName?.()) ?? `#${i}`);
      }
      out.lumetriParamNames = names;
    }
  } catch (e) {
    out.lumetriParamErr = e instanceof Error ? e.message : String(e);
  }

  return out;
}

/**
 * C11/C12 — Probe THỰC NGHIỆM: thử nhiều dạng signature createAddMarkerAction,
 * đo số marker trước/sau qua executeTransaction, dạng nào +1 là ĐÚNG. Tự dọn
 * marker đã thêm (createRemoveMarkerAction). Gọi qua RPC _debug.markerProbe.
 */
export async function markerAddProbe(): Promise<Record<string, unknown>> {
  if (!ppro) return { error: 'not in UXP' };
  const out: Record<string, unknown> = {};
  const pp = ppro as Record<string, unknown>;
  const MarkersC = pp.Markers as (new (s: unknown) => MarkersInst) | undefined;
  const MarkerC = pp.Marker as
    | ((new (t?: unknown) => unknown) & { MARKER_TYPE_COMMENT?: unknown })
    | undefined;
  const TickTime = pp.TickTime as { createWithSeconds?: (s: number) => unknown } | undefined;
  if (!MarkersC || !MarkerC || !TickTime?.createWithSeconds) {
    return { error: 'Markers/Marker/TickTime missing' };
  }
  const tick = (s: number): unknown => TickTime.createWithSeconds!(s);
  const typeComment = MarkerC.MARKER_TYPE_COMMENT ?? 'Comment';

  // Object UXP chết qua await ("Connection to object lost") → LUÔN lấy proj+seq
  // TƯƠI ngay trước khi dùng, KHÔNG giữ qua await.
  interface FreshProj {
    executeTransaction: (
      cb: (c: { addAction: (a: unknown) => void }) => void,
      l: string
    ) => Promise<boolean>;
    getActiveSequence: () => Promise<unknown>;
  }
  const freshProj = async (): Promise<FreshProj> =>
    (await (
      pp.Project as { getActiveProject: () => Promise<unknown> }
    ).getActiveProject()) as FreshProj;

  const countMarkers = async (): Promise<number> => {
    try {
      const proj = await freshProj();
      const seq = await proj.getActiveSequence();
      const ms = await new MarkersC(seq).getMarkers();
      return Array.isArray(ms) ? ms.length : 0;
    } catch {
      return -1;
    }
  };

  const tryVariant = async (label: string, build: (M: MarkersInst) => unknown): Promise<void> => {
    const before = await countMarkers();
    const proj = await freshProj();
    const seq = await proj.getActiveSequence();
    let act: unknown;
    try {
      act = build(new MarkersC(seq)); // sync — không await giữa fetch seq và dùng
    } catch (e) {
      out[label] =
        `createAction threw: ${(e instanceof Error ? e.message : String(e)).slice(0, 90)}`;
      return;
    }
    try {
      const ok = await proj.executeTransaction((c) => c.addAction(act), `probe ${label}`);
      const after = await countMarkers();
      out[label] = `ok=${ok} count ${before}->${after}${after > before ? ' ✓✓ ADDED' : ''}`;
      if (after > before) {
        try {
          const projA = await freshProj();
          const seqA = await projA.getActiveSequence();
          const ms = (await new MarkersC(seqA).getMarkers()) as {
            getName?: () => Promise<string>;
            getStart?: () => Promise<{ seconds?: number }>;
            getType?: () => Promise<string>;
          }[];
          const last = ms[ms.length - 1];
          out[`${label}_added`] = {
            name: await last.getName?.(),
            start: (await last.getStart?.())?.seconds,
            type: await last.getType?.(),
          };
          const projB = await freshProj();
          const seqB = await projB.getActiveSequence();
          await projB.executeTransaction(
            (c) => c.addAction(new MarkersC(seqB).createRemoveMarkerAction(last)),
            'probe cleanup'
          );
          out[`${label}_cleaned`] = (await countMarkers()) === before;
        } catch (e) {
          out[`${label}_cleanupErr`] = (e instanceof Error ? e.message : String(e)).slice(0, 90);
        }
      }
    } catch (e) {
      out[label] = `tx threw: ${(e instanceof Error ? e.message : String(e)).slice(0, 90)}`;
    }
  };

  const T = tick(7);
  await tryVariant('v1_time', (M) => M.createAddMarkerAction(T));
  await tryVariant('v2_time_type', (M) => M.createAddMarkerAction(T, typeComment));
  await tryVariant('v3_time_type_name', (M) => M.createAddMarkerAction(T, typeComment, 'PROBE'));
  await tryVariant('v4_time_name', (M) => M.createAddMarkerAction(T, 'PROBE'));
  await tryVariant('v5_newMarker', (M) => M.createAddMarkerAction(new MarkerC()));
  await tryVariant('v6_newMarkerTime', (M) => M.createAddMarkerAction(new MarkerC(T)));
  await tryVariant('v7_marker_time', (M) => M.createAddMarkerAction(new MarkerC(), T));
  return out;
}

interface MarkersInst {
  getMarkers(): Promise<unknown[]> | unknown[];
  createAddMarkerAction(...args: unknown[]): unknown;
  createRemoveMarkerAction(marker: unknown): unknown;
}

/**
 * RECUT — Probe import FCPXML → sequence. PPro26 Project có importSequences /
 * createSequenceFromMedia / importFiles. Thử lần lượt, đo số sequence trước/sau,
 * dạng nào +1 là ĐÚNG. Tự XOÁ sequence mới (deleteSequence) để sạch project.
 * Gọi qua RPC _debug.importProbe. (Đường tiến tới auto-import cho tab Tách & Tái dựng.)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RECUT SED — Validate native Scene Edit Detection end-to-end:
 *   importFiles(mp4) → createSequenceFromMedia → setSelection(clip)
 *   → SequenceUtils.performSceneEditDetectionOnSelection('ApplyCuts')
 *   → đếm số track item (= số cảnh). TỰ DỌN: deleteSequence + removeItem + khôi phục active.
 * Gọi qua RPC _debug.sedProbe.
 */
export async function sedProbe(path?: string): Promise<Record<string, unknown>> {
  if (!ppro) return { error: 'not in UXP' };
  const VIDEO = path ?? 'E:\\T11\\_recut_test.mp4';
  const out: Record<string, unknown> = { video: VIDEO };
  const pp = ppro as Record<string, any>;
  const base = (VIDEO.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '');
  const fp = async (): Promise<any> => await pp.Project.getActiveProject();
  const rootItems = async (): Promise<any[]> => {
    const p = await fp();
    const r = await p.getRootItem();
    const it = await r.getItems();
    return Array.isArray(it) ? it : [];
  };
  const vItems = async (): Promise<any[]> => {
    const p = await fp();
    const s = await p.getActiveSequence();
    const t = await s.getVideoTrack(0);
    const it = await t.getTrackItems(1, false);
    return Array.isArray(it) ? it : [];
  };

  try {
    const proj0 = await fp();
    const origSeq = await proj0.getActiveSequence();
    out.origActive = origSeq?.name ?? null;

    // 1. import mp4
    const before = (await rootItems()).length;
    const projI = await fp();
    await projI.importFiles([VIDEO]);
    const items = await rootItems();
    out.rootItems = `${before}->${items.length}`;
    // tìm clip vừa import (theo tên)
    let clip: any = null;
    for (const it of items) {
      const nm = it?.name ?? '';
      if (typeof nm === 'string' && nm.includes(base)) clip = it;
    }
    out.foundClip = clip?.name ?? '(none)';
    if (!clip) {
      out.error = 'imported clip not found';
      return out;
    }

    // 2. createSequenceFromMedia
    const projC = await fp();
    let seq: any;
    try {
      seq = await projC.createSequenceFromMedia('RECUT_SED_PROBE', [clip]);
    } catch (e) {
      // thử cast ClipProjectItem
      const CPI = pp.ClipProjectItem;
      const c2 = CPI?.cast?.(clip) ?? clip;
      seq = await (await fp()).createSequenceFromMedia('RECUT_SED_PROBE', [c2]);
    }
    out.seqCreated = seq?.name ?? '(none)';
    const projA = await fp();
    try {
      await projA.setActiveSequence?.(seq);
    } catch (e) {
      out.setActiveErr = (e instanceof Error ? e.message : String(e)).slice(0, 80);
    }

    // 3. chọn track item(s) của video — dùng seq.getSelection() (đã bound vào seq).
    //    Giữ chuỗi await tối thiểu để object UXP không chết (Trục B).
    out.itemsBeforeSED = (await vItems()).length;
    let sel: any = null;
    try {
      const sFresh = await (await fp()).getActiveSequence();
      const track = await sFresh.getVideoTrack(0);
      const its = await track.getTrackItems(1, false);
      sel = await sFresh.getSelection();
      for (const it of its) sel.addItem(it, true); // skipDuplicateCheck=true
      await sFresh.setSelection(sel);
      out.selItems = (await sel.getTrackItems?.())?.length ?? 'n/a';
      out.selSet = true;
    } catch (e) {
      out.selBuildErr = (e instanceof Error ? e.message : String(e)).slice(0, 120);
    }

    // 4. Scene Edit Detection (native)
    try {
      const ok = await pp.SequenceUtils.performSceneEditDetectionOnSelection('ApplyCuts', sel);
      out.sedOk = ok;
    } catch (e) {
      out.sedErr = (e instanceof Error ? e.message : String(e)).slice(0, 160);
    }
    // chờ Premiere xử lý
    await new Promise((r) => setTimeout(r, 2500));
    out.itemsAfterSED = (await vItems()).length;
    out.scenesDetected = (out.itemsAfterSED as number) - (out.itemsBeforeSED as number) + 1;

    // 5. DỌN: xoá sequence + clip + khôi phục active
    try {
      const projD = await fp();
      await projD.deleteSequence?.(seq);
      out.seqDeleted = true;
    } catch (e) {
      out.seqDeleteErr = (e instanceof Error ? e.message : String(e)).slice(0, 80);
    }
    try {
      const projR = await fp();
      const root = await projR.getRootItem();
      // tìm lại clip theo tên (object cũ có thể chết)
      const it2 = (await root.getItems()).find((x: any) => (x?.name ?? '').includes(base));
      if (it2) {
        await projR.executeTransaction(
          (c: any) => c.addAction(root.createRemoveItemAction(it2)),
          'recut probe cleanup clip'
        );
        out.clipRemoved = true;
      }
    } catch (e) {
      out.clipRemoveErr = (e instanceof Error ? e.message : String(e)).slice(0, 80);
    }
  } catch (e) {
    out.fatal = e instanceof Error ? e.message : String(e);
  }
  return out;
}

/**
 * RECUT R1 — Phân mảnh cảnh (production). Như sedProbe nhưng GIỮ sequence + trả
 * danh sách cảnh (index/start/duration). Lane A: video đã-dựng → sequence cắt-cảnh
 * editable. Gọi qua RPC `recut.detectScenes`.
 */
export async function recutDetectScenes(videoPath?: string): Promise<Record<string, unknown>> {
  if (!ppro) return { error: 'not in UXP' };
  const VIDEO = videoPath;
  if (!VIDEO) return { error: 'thiếu videoPath' };
  const out: Record<string, unknown> = { video: VIDEO };
  const pp = ppro as Record<string, any>;
  const base = (VIDEO.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '');
  const fp = async (): Promise<any> => await pp.Project.getActiveProject();
  const rootItems = async (): Promise<any[]> => {
    const p = await fp();
    const r = await p.getRootItem();
    const it = await r.getItems();
    return Array.isArray(it) ? it : [];
  };
  const vItems = async (): Promise<any[]> => {
    const p = await fp();
    const s = await p.getActiveSequence();
    const t = await s.getVideoTrack(0);
    const it = await t.getTrackItems(1, false);
    return Array.isArray(it) ? it : [];
  };
  try {
    // 1. import video (mp4) — bỏ qua nếu đã có project item cùng tên
    let items = await rootItems();
    let clip = items.find((it) => typeof it?.name === 'string' && it.name.includes(base));
    if (!clip) {
      await (await fp()).importFiles([VIDEO]);
      items = await rootItems();
      clip = items.find((it) => typeof it?.name === 'string' && it.name.includes(base));
    }
    if (!clip) {
      out.error = 'không tìm thấy clip sau import';
      return out;
    }
    // 2. tạo sequence từ clip
    const projC = await fp();
    let seq: any;
    try {
      seq = await projC.createSequenceFromMedia(`Recut — ${base}`, [clip]);
    } catch {
      const CPI = pp.ClipProjectItem;
      const c2 = CPI?.cast?.(clip) ?? clip;
      seq = await (await fp()).createSequenceFromMedia(`Recut — ${base}`, [c2]);
    }
    out.sequenceId = seq?.guid?.toString?.() ?? seq?.name ?? null;
    out.sequenceName = seq?.name ?? null;
    await (await fp()).setActiveSequence?.(seq);
    // 3. chọn clip + Scene Edit Detection ('ApplyCuts')
    const sFresh = await (await fp()).getActiveSequence();
    const track = await sFresh.getVideoTrack(0);
    const its = await track.getTrackItems(1, false);
    const sel = await sFresh.getSelection();
    for (const it of its) sel.addItem(it, true);
    await sFresh.setSelection(sel);
    const ok = await pp.SequenceUtils.performSceneEditDetectionOnSelection('ApplyCuts', sel);
    out.sedOk = ok;
    // B8 — đợi SED XONG = số trackitem ỔN ĐỊNH (thay vì đợi cứng 2.5s). Video
    // dài SED chạy lâu hơn → đợi cứng sẽ đếm khi CHƯA xong → sai/thiếu cảnh.
    // Có cắt (cnt>1) ổn định 1.5s → xong sớm; không cắt → bỏ chờ sau ~4s; trần 30s.
    let prev = -1;
    let stable = 0;
    let polls = 0;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const cnt = (await vItems()).length;
      polls = i + 1;
      if (cnt === prev) {
        stable++;
        if (stable >= (cnt > 1 ? 3 : 8)) break;
      } else {
        stable = 0;
        prev = cnt;
      }
    }
    out.sedPolls = polls;
    // 4. liệt kê cảnh (KHÔNG dọn — giữ sequence cho Lane A)
    const after = await vItems();
    const scenes: any[] = [];
    for (let i = 0; i < after.length; i++) {
      const it = after[i];
      const st = await it.getStartTime?.();
      const du = await it.getDuration?.();
      scenes.push({
        index: i,
        startSec: Number(st?.seconds ?? 0),
        durationSec: Number(du?.seconds ?? 0),
      });
    }
    out.sceneCount = scenes.length;
    out.scenes = scenes;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}

/**
 * ADJ-LAYER probe — liệt kê item trong bin (nhận diện adjustment layer) + chữ
 * ký các action chèn của SequenceEditor. Gọi qua `_debug.adjLayerProbe`.
 */
export async function adjLayerProbe(): Promise<Record<string, unknown>> {
  if (!ppro) return { error: 'not in UXP' };
  const pp = ppro as Record<string, any>;
  const out: Record<string, unknown> = {};
  const proj = await pp.Project?.getActiveProject?.();
  const root = await proj?.getRootItem?.();
  if (!root) return { error: 'no root item' };
  out.rootMembers = listMembers(root);
  // Tìm hàm lấy con của bin.
  let items: any[] = [];
  for (const fn of ['getItems', 'getChildItems', 'getItemsByType', 'children']) {
    try {
      const f = (root as any)[fn];
      if (typeof f === 'function') {
        const r = await f.call(root);
        if (Array.isArray(r) && r.length) {
          items = r;
          out.childGetter = fn;
          break;
        }
      } else if (Array.isArray(f)) {
        items = f;
        out.childGetter = fn + ' (prop)';
        break;
      }
    } catch (e) {
      out[`${fn}_err`] = e instanceof Error ? e.message : String(e);
    }
  }
  out.itemCount = items.length;
  const rows: any[] = [];
  const describe = async (it: any, depth: number): Promise<void> => {
    const o: any = { depth };
    try {
      o.name = it?.name ?? (await it?.getName?.());
    } catch {
      o.name = '?';
    }
    // type là PROPERTY trên ProjectItem PPro26 (không phải method).
    try {
      const t = (it as any).type;
      o.type = typeof t === 'function' ? await t.call(it) : t;
    } catch {
      /* skip */
    }
    // Adjustment layer = ProjectItem KHÔNG có media file path (synthetic).
    let hasPath = false;
    for (const m of ['getMediaFilePath', 'getMediaPath', 'getFilePath']) {
      try {
        const f = (it as any)[m];
        if (typeof f === 'function') {
          const p = await f.call(it);
          if (typeof p === 'string' && p.length > 0) {
            hasPath = true;
            break;
          }
        }
      } catch {
        /* skip */
      }
    }
    o.hasPath = hasPath;
    rows.push(o);
    // Đệ quy vào bin (depth tối đa 2).
    if (depth < 2) {
      try {
        const kids = (it as any).getItems ? await (it as any).getItems() : null;
        if (Array.isArray(kids) && kids.length) for (const k of kids) await describe(k, depth + 1);
      } catch {
        /* skip */
      }
    }
  };
  for (const it of items.slice(0, 60)) await describe(it, 0);
  out.items = rows;
  // Ứng viên adjustment layer: KHÔNG có media path + không phải bin.
  out.adjCandidates = rows.filter((r) => !r.hasPath && !/bin|folder/i.test(String(r.type ?? '')));
  // Chữ ký action chèn của SequenceEditor.
  try {
    const seq = await proj?.getActiveSequence?.();
    const ed = pp.SequenceEditor?.getEditor?.(seq);
    if (ed) {
      out.editorArities = {
        createOverwriteItemAction: ed.createOverwriteItemAction?.length,
        createInsertProjectItemAction: ed.createInsertProjectItemAction?.length,
        createAddItemAction: ed.createAddItemAction?.length,
      };
      out.vTrackCount = await seq?.getVideoTrackCount?.();
    }
  } catch (e) {
    out.editorErr = e instanceof Error ? e.message : String(e);
  }
  return out;
}

/**
 * SPIKES S1/S5/S4 — kiểm 3 ẩn số chốt phạm vi MVP recut:
 *  S1: `color`/Lumetri Exposure SET value có PERSIST không (đọc lại)?
 *  S5: Transform `Scale` SET value persist không → quyết flip/crop làm được trong Premiere?
 *  S4: API chèn audio clip vào track theo thời gian (cho import stem ngược).
 * Tự KHÔI PHỤC giá trị + DỌN component đã append. Gọi qua `_debug.spikeProbe`.
 */
export async function spikeProbe(): Promise<Record<string, unknown>> {
  if (!ppro) return { error: 'not in UXP' };
  const out: Record<string, unknown> = {};
  const pp = ppro as Record<string, any>;
  const Proj = pp.Project;
  const VFF = pp.VideoFilterFactory;
  const num = (v: any): number =>
    v && typeof v === 'object' && 'value' in v ? Number(v.value) : Number(v);

  const freshItem = async (): Promise<{ proj: any; item: any }> => {
    const proj = await Proj.getActiveProject();
    const seq = await proj.getActiveSequence();
    const track = await seq.getVideoTrack(0);
    const items = await track.getTrackItems(1, false);
    return { proj, item: items[0] };
  };
  const chainComps = async (item: any): Promise<{ chain: any; comps: any[] }> => {
    const chain = await item.getComponentChain();
    const n = await chain.getComponentCount();
    const comps: any[] = [];
    for (let i = 0; i < n; i++) {
      const c = await chain.getComponentAtIndex(i);
      comps.push({ c, mn: await c.getMatchName(), dn: await c.getDisplayName() });
    }
    return { chain, comps };
  };
  const paramByName = async (comp: any, re: RegExp): Promise<any> => {
    const pc = await comp.getParamCount();
    for (let i = 0; i < pc; i++) {
      const p = await comp.getParam(i);
      const dn = (await p.getDisplayName?.()) ?? p.displayName ?? '';
      if (re.test(dn)) return { p, dn };
    }
    return null;
  };
  const find = (comps: any[], re: RegExp): any =>
    comps.find((c) => re.test(c.mn ?? '') || re.test(c.dn ?? ''));

  // ===== S1: Lumetri Exposure persist =====
  try {
    let { proj, item } = await freshItem();
    let { chain, comps } = await chainComps(item);
    let lum = find(comps, /lumetri/i);
    let appended = false;
    if (!lum) {
      const comp = await VFF.createComponent('AE.ADBE Lumetri');
      await proj.executeTransaction(
        (c: any) => c.addAction(chain.createAppendComponentAction(comp)),
        'spike S1 add lumetri'
      );
      appended = true;
      ({ proj, item } = await freshItem());
      ({ chain, comps } = await chainComps(item));
      lum = find(comps, /lumetri/i);
    }
    out.S1_lumetriFound = !!lum;
    if (lum) {
      const ex = await paramByName(lum.c, /exposure/i);
      out.S1_exposureParam = ex?.dn ?? '(none)';
      if (ex) {
        const before = num(await ex.p.getStartValue());
        out.S1_before = before;
        const kf = await ex.p.createKeyframe(0.85);
        await proj.executeTransaction(
          (c: any) => c.addAction(ex.p.createSetValueAction(kf)),
          'spike S1 set exposure'
        );
        const f2 = await freshItem();
        const cc2 = await chainComps(f2.item);
        const lum2 = find(cc2.comps, /lumetri/i);
        const ex2 = lum2 && (await paramByName(lum2.c, /exposure/i));
        out.S1_after = ex2 ? num(await ex2.p.getStartValue()) : 'n/a';
        out.S1_persist = out.S1_after === 0.85;
        // khôi phục giá trị gốc
        if (ex2) {
          const kf0 = await ex2.p.createKeyframe(before);
          await f2.proj.executeTransaction(
            (c: any) => c.addAction(ex2.p.createSetValueAction(kf0)),
            'spike S1 restore'
          );
        }
      }
    }
    if (appended) {
      const f3 = await freshItem();
      const cc3 = await chainComps(f3.item);
      const lum3 = find(cc3.comps, /lumetri/i);
      if (lum3)
        await f3.proj.executeTransaction(
          (c: any) => c.addAction(cc3.chain.createRemoveComponentAction(lum3.c)),
          'spike S1 rm lumetri'
        );
      out.S1_cleaned = true;
    }
  } catch (e) {
    out.S1_err = (e instanceof Error ? e.message : String(e)).slice(0, 180);
  }

  // ===== S5: Transform Scale persist (flip/crop) =====
  try {
    const { proj, item } = await freshItem();
    const { chain } = await chainComps(item);
    const comp = await VFF.createComponent('AE.ADBE Transform');
    out.S5_transformCreated = !!comp;
    await proj.executeTransaction(
      (c: any) => c.addAction(chain.createAppendComponentAction(comp)),
      'spike S5 add transform'
    );
    const f = await freshItem();
    const cc = await chainComps(f.item);
    const tr = find(cc.comps, /transform/i);
    out.S5_transformFound = !!tr;
    if (tr) {
      const pcount = await tr.c.getParamCount();
      const names: string[] = [];
      for (let i = 0; i < Math.min(pcount, 30); i++) {
        const p = await tr.c.getParam(i);
        names.push((await p.getDisplayName?.()) ?? p.displayName ?? `#${i}`);
      }
      out.S5_transformParams = names;
      const sc = (await paramByName(tr.c, /scale width/i)) ?? (await paramByName(tr.c, /scale/i));
      out.S5_scaleParam = sc?.dn ?? '(none)';
      if (sc) {
        out.S5_before = num(await sc.p.getStartValue());
        const kf = await sc.p.createKeyframe(-100);
        await f.proj.executeTransaction(
          (c: any) => c.addAction(sc.p.createSetValueAction(kf)),
          'spike S5 set scale -100'
        );
        const f2 = await freshItem();
        const cc2 = await chainComps(f2.item);
        const tr2 = find(cc2.comps, /transform/i);
        const sc2 =
          tr2 &&
          ((await paramByName(tr2.c, /scale width/i)) ?? (await paramByName(tr2.c, /scale/i)));
        out.S5_after = sc2 ? num(await sc2.p.getStartValue()) : 'n/a';
        out.S5_persist = out.S5_after === -100;
      }
    }
    const f4 = await freshItem();
    const cc4 = await chainComps(f4.item);
    const tr4 = find(cc4.comps, /transform/i);
    if (tr4)
      await f4.proj.executeTransaction(
        (c: any) => c.addAction(cc4.chain.createRemoveComponentAction(tr4.c)),
        'spike S5 rm transform'
      );
    out.S5_cleaned = true;
  } catch (e) {
    out.S5_err = (e instanceof Error ? e.message : String(e)).slice(0, 180);
  }

  // ===== S4: API chèn audio clip (dump khả năng) =====
  try {
    const proj = await Proj.getActiveProject();
    const seq = await proj.getActiveSequence();
    const atrack = await seq.getAudioTrack(0);
    out.S4_audioTrackInsertApi = listMembers(atrack).filter((m) =>
      /insert|overwrite|append|add|clip|item|action/i.test(m)
    );
    const root = await proj.getRootItem();
    const items = await root.getItems();
    const aClip = items.find((it: any) => /\.(wav|mp3|m4a|aac)$/i.test(it?.name ?? ''));
    out.S4_audioAssetInProject = aClip?.name ?? '(none)';
    out.S4_sequenceEditorApi = listMembers(pp.SequenceEditor).filter((m) =>
      /insert|overwrite|append|clip|action/i.test(m)
    );
  } catch (e) {
    out.S4_err = (e instanceof Error ? e.message : String(e)).slice(0, 180);
  }

  return out;
}

export async function importProbe(path?: string): Promise<Record<string, unknown>> {
  if (!ppro) return { error: 'not in UXP' };
  const FCPXML = path ?? 'E:\\T11\\_recut_test_recut.fcpxml';
  const out: Record<string, unknown> = { fcpxml: FCPXML };
  const pp = ppro as Record<string, any>;

  // helper-class members (có thể chứa importer tĩnh)
  for (const n of ['ProjectUtils', 'SequenceUtils']) {
    try {
      out[`static_${n}`] = listMembers(pp[n]);
    } catch (e) {
      out[`static_${n}_err`] = e instanceof Error ? e.message : String(e);
    }
  }

  const freshProj = async (): Promise<any> => await pp.Project.getActiveProject();
  const seqList = async (): Promise<any[]> => {
    try {
      const p = await freshProj();
      const s = await p.getSequences?.();
      return Array.isArray(s) ? s : [];
    } catch {
      return [];
    }
  };
  const count = async (): Promise<number> => (await seqList()).length;

  // arity + root accessor
  try {
    const p0 = await freshProj();
    out.importSequencesArity = p0.importSequences?.length ?? null;
    out.importFilesArity = p0.importFiles?.length ?? null;
    out.createSeqFromMediaArity = p0.createSequenceFromMedia?.length ?? null;
    out.hasGetRootItem = typeof p0.getRootItem;
    out.hasRootItemProp = typeof p0.rootItem;
  } catch (e) {
    out.arityErr = e instanceof Error ? e.message : String(e);
  }

  const tryVariant = async (label: string, fn: (proj: any) => Promise<unknown>): Promise<void> => {
    const before = await count();
    try {
      const proj = await freshProj();
      const ret = await fn(proj);
      const after = await count();
      const added = after > before;
      out[label] =
        `before=${before} after=${after}${added ? ' ✓✓ SEQ ADDED' : ''} ret=` +
        (ret === undefined
          ? 'undefined'
          : Array.isArray(ret)
            ? `array[${ret.length}]`
            : typeof ret);
      if (added) {
        try {
          const seqs = await seqList();
          const ns = seqs[seqs.length - 1];
          out[`${label}_newName`] = ns?.name ?? (await ns?.getName?.());
          const projC = await freshProj();
          await projC.deleteSequence?.(ns);
          out[`${label}_cleaned`] = (await count()) === before;
        } catch (e) {
          out[`${label}_cleanupErr`] = (e instanceof Error ? e.message : String(e)).slice(0, 100);
        }
      }
    } catch (e) {
      out[label] = `THREW: ${(e instanceof Error ? e.message : String(e)).slice(0, 140)}`;
    }
  };

  // DUMP THUẦN (không mutate) — nắm API cho native Scene Edit Detection:
  //  createSequenceFromMedia(name, clipItems[], bin?) + performSceneEditDetectionOnSelection(op, selection)
  void FCPXML;
  void tryVariant;
  try {
    const proj = await freshProj();
    const root = await proj.getRootItem?.();
    out.rootItemMembers = listMembers(root);
    // cách liệt kê item con của root (tìm clip đã import)
    for (const fn of ['getItems', 'getChildItems', 'children', 'getItemCount']) {
      try {
        const r = await (root as any)?.[fn]?.();
        out[`root_${fn}`] = Array.isArray(r) ? `array[${r.length}]` : typeof r;
      } catch (e) {
        out[`root_${fn}_err`] = (e instanceof Error ? e.message : String(e)).slice(0, 60);
      }
    }
  } catch (e) {
    out.rootErr = e instanceof Error ? e.message : String(e);
  }
  try {
    const proj = await freshProj();
    const seq = await proj.getActiveSequence?.();
    if (seq) {
      out.seqSelectMembers = listMembers(seq).filter((m) =>
        /select|track|item|subseq|caption/i.test(m)
      );
      // thử lấy selection hiện có
      for (const fn of ['getSelection', 'getSelectedTrackItems']) {
        try {
          const sel = await (seq as any)?.[fn]?.();
          out[`seq_${fn}`] = sel === undefined ? 'undefined' : listMembers(sel);
        } catch (e) {
          out[`seq_${fn}_err`] = (e instanceof Error ? e.message : String(e)).slice(0, 60);
        }
      }
    }
  } catch (e) {
    out.seqErr = e instanceof Error ? e.message : String(e);
  }
  // SequenceEditor + TrackItemSelection classes
  for (const n of ['SequenceEditor', 'TrackItemSelection', 'VideoClipTrackItem']) {
    try {
      out[`static_${n}`] = listMembers(pp[n]);
    } catch (e) {
      out[`static_${n}_err`] = e instanceof Error ? e.message : String(e);
    }
  }
  out.SED_APPLYCUT = pp.SequenceUtils?.SEQUENCE_OPERATION_APPLYCUT;
  out.SED_CREATEMARKER = pp.SequenceUtils?.SEQUENCE_OPERATION_CREATEMARKER;
  out.SED_CREATESUBCLIP = pp.SequenceUtils?.SEQUENCE_OPERATION_CREATESUBCLIP;
  return out;
}

/**
 * C15 — Probe param audio (Volume/Level) + keyframe: trả displayName/startValue
 * mọi param, members của keyframe object, và set Level rồi đọc lại để hiểu
 * value-semantics. Tự khôi phục. Gọi qua _debug.audioProbe.
 */
export async function audioProbe(): Promise<Record<string, unknown>> {
  if (!ppro) return { error: 'not in UXP' };
  const out: Record<string, unknown> = {};
  const pp = ppro as Record<string, unknown>;
  const Proj = pp.Project as { getActiveProject: () => Promise<unknown> };
  const volLevel = async (): Promise<{
    proj: {
      executeTransaction: (
        cb: (c: { addAction: (a: unknown) => void }) => void,
        l: string
      ) => Promise<boolean>;
    };
    lp: Record<string, (...a: unknown[]) => unknown> & { displayName?: string };
    vol: { getParamCount?: () => Promise<number>; getParam?: (i: number) => Promise<unknown> };
  } | null> => {
    const proj = (await Proj.getActiveProject()) as {
      getActiveSequence: () => Promise<unknown>;
      executeTransaction: (
        cb: (c: { addAction: (a: unknown) => void }) => void,
        l: string
      ) => Promise<boolean>;
    };
    const seq = (await proj.getActiveSequence()) as {
      getAudioTrack: (i: number) => Promise<unknown>;
    };
    const track = (await seq.getAudioTrack(0)) as {
      getTrackItems: (t: number, b: boolean) => Promise<unknown[]>;
    };
    const items = await track.getTrackItems(1, false);
    const item = items[0] as { getComponentChain: () => Promise<unknown> };
    const chain = (await item.getComponentChain()) as {
      getComponentCount: () => Promise<number>;
      getComponentAtIndex: (i: number) => Promise<unknown>;
    };
    const count = await chain.getComponentCount();
    for (let i = 0; i < count; i++) {
      const c = (await chain.getComponentAtIndex(i)) as {
        getMatchName: () => Promise<string>;
        getDisplayName: () => Promise<string>;
        getParamCount?: () => Promise<number>;
        getParam?: (i: number) => Promise<unknown>;
      };
      const dn = await c.getDisplayName();
      if (/volume/i.test(dn) && !/channel/i.test(dn)) {
        const pc = (await c.getParamCount?.()) ?? 0;
        let lp: unknown = null;
        for (let j = 0; j < pc; j++) {
          const p = (await c.getParam?.(j)) as { displayName?: string };
          if (/level/i.test(p?.displayName ?? '')) {
            lp = p;
            break;
          }
        }
        if (!lp) lp = await c.getParam?.(0);
        return { proj, lp: lp as never, vol: c };
      }
    }
    return null;
  };

  try {
    const a = await volLevel();
    if (!a) return { error: 'no Volume component' };
    const pc = (await a.vol.getParamCount?.()) ?? 0;
    const params: unknown[] = [];
    for (let i = 0; i < pc; i++) {
      const p = (await a.vol.getParam?.(i)) as {
        displayName?: string;
        getStartValue?: () => Promise<number>;
      };
      let sv: unknown;
      try {
        sv = await p.getStartValue?.();
      } catch (e) {
        sv = `err:${String(e).slice(0, 30)}`;
      }
      params.push({ i, displayName: p?.displayName, startValue: sv });
    }
    out.volParams = params;
    out.levelDisplayName = (a.lp as { displayName?: string }).displayName;
    out.levelBefore = await (a.lp.getStartValue as () => Promise<number>)?.();
    // tạo keyframe -6 → dump members + thử đọc value
    const kf = await a.lp.createKeyframe(-6);
    out.keyframeMembers = listMembers(kf);
    out.keyframeValueProp = (kf as { value?: unknown }).value;
    // set value
    const act = a.lp.createSetValueAction(kf);
    await a.proj.executeTransaction((c) => c.addAction(act), 'probe setLevel -6');
    // đọc lại FRESH
    const b = await volLevel();
    out.levelAfterSet = await (b?.lp.getStartValue as () => Promise<number>)?.();
    // khôi phục
    if (b && typeof out.levelBefore === 'number') {
      const kf0 = await b.lp.createKeyframe(out.levelBefore as number);
      await b.proj.executeTransaction(
        (c) => c.addAction(b.lp.createSetValueAction(kf0)),
        'probe restore'
      );
      const c2 = await volLevel();
      out.levelRestored = await (c2?.lp.getStartValue as () => Promise<number>)?.();
    }
  } catch (e) {
    out.err = e instanceof Error ? e.message : String(e);
  }
  return out;
}

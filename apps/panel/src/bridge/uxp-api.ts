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
  ]) {
    dumpStatic(n);
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

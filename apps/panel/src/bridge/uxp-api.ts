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

export function getActiveSequenceName(): string {
  if (!ppro) return '(mock)';
  const proj = ppro.getActiveProject?.();
  const seq = proj?.getActiveSequence?.();
  return seq?.name ?? 'No sequence';
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
  ]) {
    dumpStatic(n);
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

import { z } from 'zod';
import type { Seconds } from '@directorai/core';
import type { IPremiereAdapter } from './types.js';
import { withRetry, AbortError } from './retry.js';
import { CACHEABLE_METHODS, INVALIDATIONS, type ReadCache } from './cache.js';

interface RpcHandler {
  schema: z.ZodTypeAny;
  run: (params: unknown, adapter: IPremiereAdapter) => Promise<unknown>;
}

const MUTATING_METHODS = new Set([
  'project.setActiveSequence',
  'timeline.cutClip',
  'timeline.trimClip',
  'timeline.moveClip',
  'timeline.deleteClip',
  'timeline.setClipDisabled',
  'timeline.renameClip',
  'timeline.setClipInOut',
  'effect.apply',
  'effect.remove',
  'media.import',
  'marker.add',
  'marker.delete',
  'export.sequence',
  'keyframe.add',
  'color.applyPreset',
  'color.setParams',
  'color.getParams',
  'audio.setGain',
  'audio.addFade',
  'audio.muteTrack',
  'text.addOverlay',
  'transition.apply',
  'transition.remove',
]);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method);
}

const Empty = z.object({}).optional();
const SeqId = z.object({ sequenceId: z.string() });
const ClipId = z.object({ clipId: z.string() });

const handlers: Record<string, RpcHandler> = {
  'project.get': { schema: Empty, run: (_p, a) => a.getProject() },
  'project.listSequences': { schema: Empty, run: (_p, a) => a.listSequences() },
  'project.setActiveSequence': {
    schema: SeqId,
    run: (p, a) => a.setActiveSequence((p as { sequenceId: string }).sequenceId),
  },
  'project.getActiveSequence': { schema: Empty, run: (_p, a) => a.getActiveSequence() },

  'timeline.listClips': {
    schema: SeqId,
    run: (p, a) => a.listClips((p as { sequenceId: string }).sequenceId),
  },
  'timeline.getClip': {
    schema: ClipId,
    run: (p, a) => a.getClip((p as { clipId: string }).clipId),
  },
  'timeline.cutClip': {
    schema: z.object({ clipId: z.string(), at: z.number() }),
    run: (p, a) =>
      a.cutClip({
        clipId: (p as { clipId: string }).clipId,
        at: (p as { at: number }).at as Seconds,
      }),
  },
  'timeline.trimClip': {
    schema: z.object({
      clipId: z.string(),
      newRange: z.object({ start: z.number(), end: z.number() }),
    }),
    run: (p, a) => {
      const params = p as { clipId: string; newRange: { start: number; end: number } };
      return a.trimClip({
        clipId: params.clipId,
        newRange: { start: params.newRange.start as Seconds, end: params.newRange.end as Seconds },
      });
    },
  },
  'timeline.moveClip': {
    schema: z.object({
      clipId: z.string(),
      newStart: z.number(),
      newTrackId: z.string().optional(),
    }),
    run: (p, a) => {
      const params = p as { clipId: string; newStart: number; newTrackId?: string };
      return a.moveClip({
        clipId: params.clipId,
        newStart: params.newStart as Seconds,
        newTrackId: params.newTrackId,
      });
    },
  },
  'timeline.deleteClip': {
    schema: ClipId,
    run: (p, a) => a.deleteClip((p as { clipId: string }).clipId),
  },
  'timeline.setClipDisabled': {
    schema: z.object({ clipId: z.string(), disabled: z.boolean() }),
    run: (p, a) => {
      const params = p as { clipId: string; disabled: boolean };
      return a.setClipDisabled(params.clipId, params.disabled);
    },
  },
  'timeline.renameClip': {
    schema: z.object({ clipId: z.string(), newName: z.string().min(1) }),
    run: (p, a) => {
      const params = p as { clipId: string; newName: string };
      return a.renameClip(params.clipId, params.newName);
    },
  },
  'timeline.setClipInOut': {
    schema: z.object({ clipId: z.string(), inSec: z.number(), outSec: z.number() }),
    run: (p, a) => {
      const params = p as { clipId: string; inSec: number; outSec: number };
      return a.setClipInOut(params.clipId, params.inSec as Seconds, params.outSec as Seconds);
    },
  },

  'effect.apply': {
    schema: z.object({ clipId: z.string(), effectMatchName: z.string() }),
    run: (p, a) => a.applyEffect(p as { clipId: string; effectMatchName: string }),
  },
  'effect.remove': {
    schema: z.object({ clipId: z.string(), effectId: z.string() }),
    run: (p, a) => {
      const params = p as { clipId: string; effectId: string };
      return a.removeEffect(params.clipId, params.effectId);
    },
  },
  'effect.list': {
    schema: z.object({ clipId: z.string() }),
    run: (p, a) => a.listClipEffects((p as { clipId: string }).clipId),
  },

  'media.import': {
    schema: z.object({ path: z.string(), binId: z.string().optional() }),
    run: (p, a) => a.importFile(p as { path: string; binId?: string }),
  },

  'marker.add': {
    schema: z.object({
      sequenceId: z.string(),
      time: z.number(),
      name: z.string(),
      comment: z.string().optional(),
      color: z.string().optional(),
    }),
    run: (p, a) => {
      const params = p as {
        sequenceId: string;
        time: number;
        name: string;
        comment?: string;
        color?: string;
      };
      return a.addMarker({
        sequenceId: params.sequenceId,
        time: params.time as Seconds,
        name: params.name,
        comment: params.comment,
        color: params.color,
      });
    },
  },
  'marker.list': {
    schema: SeqId,
    run: (p, a) => a.listMarkers((p as { sequenceId: string }).sequenceId),
  },
  'marker.delete': {
    schema: z.object({ sequenceId: z.string(), markerId: z.string() }),
    run: (p, a) => {
      const params = p as { sequenceId: string; markerId: string };
      return a.deleteMarker(params.sequenceId, params.markerId);
    },
  },

  'export.sequence': {
    schema: z.object({
      sequenceId: z.string(),
      outputPath: z.string(),
      presetPath: z.string(),
    }),
    run: (p, a) =>
      a.exportSequence(p as { sequenceId: string; outputPath: string; presetPath: string }),
  },

  'keyframe.add': {
    schema: z.object({
      clipId: z.string(),
      effectId: z.string(),
      paramName: z.string(),
      time: z.number(),
      value: z.union([z.number(), z.string(), z.boolean()]),
    }),
    run: (p, a) => {
      const params = p as {
        clipId: string;
        effectId: string;
        paramName: string;
        time: number;
        value: number | string | boolean;
      };
      return a.addKeyframe({
        clipId: params.clipId,
        effectId: params.effectId,
        paramName: params.paramName,
        time: params.time as Seconds,
        value: params.value,
      });
    },
  },

  'color.applyPreset': {
    schema: z.object({ clipId: z.string(), presetName: z.string() }),
    run: (p, a) => {
      const params = p as { clipId: string; presetName: string };
      return a.applyColorPreset(params.clipId, params.presetName);
    },
  },
  'color.setParams': {
    // V4 — full 9-slider Lumetri Basic Correction surface.
    schema: z.object({
      clipId: z.string(),
      exposure: z.number().min(-5).max(5).optional(),
      contrast: z.number().min(-100).max(100).optional(),
      highlights: z.number().min(-100).max(100).optional(),
      shadows: z.number().min(-100).max(100).optional(),
      whites: z.number().min(-100).max(100).optional(),
      blacks: z.number().min(-100).max(100).optional(),
      saturation: z.number().min(0).max(200).optional(),
      vibrance: z.number().min(-100).max(100).optional(),
      temperature: z.number().min(-100).max(100).optional(),
    }),
    run: (p, a) => a.setColorParams(p as Parameters<IPremiereAdapter['setColorParams']>[0]),
  },
  'color.getParams': {
    schema: z.object({ clipId: z.string() }),
    run: (p, a) => a.getColorParams((p as { clipId: string }).clipId),
  },

  'audio.setGain': {
    schema: z.object({ clipId: z.string(), gainDb: z.number() }),
    run: (p, a) => a.setAudioGain(p as { clipId: string; gainDb: number }),
  },
  'audio.getGain': {
    schema: z.object({ clipId: z.string() }),
    run: (p, a) => a.getAudioGain((p as { clipId: string }).clipId),
  },
  'audio.addFade': {
    schema: z.object({
      clipId: z.string(),
      durationSec: z.number(),
      type: z.enum(['in', 'out']),
    }),
    run: (p, a) => {
      const params = p as { clipId: string; durationSec: number; type: 'in' | 'out' };
      return a.addAudioFade({
        clipId: params.clipId,
        durationSec: params.durationSec as Seconds,
        type: params.type,
      });
    },
  },
  'audio.muteTrack': {
    schema: z.object({ sequenceId: z.string(), trackId: z.string(), muted: z.boolean() }),
    run: (p, a) => {
      const params = p as { sequenceId: string; trackId: string; muted: boolean };
      return a.muteTrack(params.sequenceId, params.trackId, params.muted);
    },
  },

  'text.addOverlay': {
    schema: z.object({
      sequenceId: z.string(),
      trackIndex: z.number().int().min(0),
      text: z.string(),
      startTime: z.number(),
      duration: z.number(),
      font: z.string().optional(),
      fontSize: z.number().optional(),
    }),
    run: (p, a) => {
      const params = p as {
        sequenceId: string;
        trackIndex: number;
        text: string;
        startTime: number;
        duration: number;
        font?: string;
        fontSize?: number;
      };
      return a.addTextOverlay({
        sequenceId: params.sequenceId,
        trackIndex: params.trackIndex,
        text: params.text,
        startTime: params.startTime as Seconds,
        duration: params.duration as Seconds,
        font: params.font,
        fontSize: params.fontSize,
      });
    },
  },

  'transition.apply': {
    schema: z.object({
      clipIdA: z.string(),
      clipIdB: z.string(),
      matchName: z.string(),
      durationSec: z.number(),
    }),
    run: (p, a) => {
      const params = p as {
        clipIdA: string;
        clipIdB: string;
        matchName: string;
        durationSec: number;
      };
      return a.applyTransition({
        clipIdA: params.clipIdA,
        clipIdB: params.clipIdB,
        matchName: params.matchName,
        durationSec: params.durationSec as Seconds,
      });
    },
  },
  'transition.remove': {
    schema: z.object({ clipId: z.string(), atStart: z.boolean().optional() }),
    run: (p, a) => {
      const params = p as { clipId: string; atStart?: boolean };
      return a.removeTransition(params.clipId, params.atStart ?? true);
    },
  },
  'transition.list': { schema: Empty, run: (_p, a) => a.listTransitions() },

  'tracks.list': {
    schema: SeqId,
    run: (p, a) => a.listTracks((p as { sequenceId: string }).sequenceId),
  },

  'undo.begin': {
    schema: z.object({ label: z.string() }),
    run: (p, a) => a.beginUndoGroup((p as { label: string }).label),
  },
  'undo.end': { schema: Empty, run: (_p, a) => a.endUndoGroup() },
};

export interface DispatchOptions {
  /** Wrap mutating methods in an undo group automatically (default: true). */
  readonly autoUndoGroup?: boolean;
  /** Retry transient adapter errors with exponential backoff (default: true). */
  readonly retry?: boolean;
  /**
   * Optional cancellation signal (P4.03). When aborted before the call
   * starts, the dispatcher throws `AbortError` and never touches the
   * adapter. Aborts mid-flight are surfaced by the work itself if it
   * honours the signal — for our adapters, the practical effect is the
   * retry sleep returns immediately.
   */
  readonly signal?: AbortSignal;
  /**
   * Optional read cache (P4.15). When provided, methods in
   * `CACHEABLE_METHODS` go through it; mutating methods invalidate
   * matching entries on success.
   */
  readonly cache?: ReadCache;
}

const inProgressUndoGroups = new WeakSet<IPremiereAdapter>();

async function runWithAutoUndo<T>(
  method: string,
  adapter: IPremiereAdapter,
  fn: () => Promise<T>
): Promise<T> {
  // Skip if we're already inside a user-initiated undo group OR if the
  // method itself manages undo state (undo.begin / undo.end).
  if (
    !isMutatingMethod(method) ||
    inProgressUndoGroups.has(adapter) ||
    method === 'undo.begin' ||
    method === 'undo.end'
  ) {
    return fn();
  }

  inProgressUndoGroups.add(adapter);
  try {
    await adapter.beginUndoGroup(`DirectorAI: ${method}`);
    try {
      return await fn();
    } finally {
      await adapter.endUndoGroup();
    }
  } finally {
    inProgressUndoGroups.delete(adapter);
  }
}

export async function dispatchRpc(
  method: string,
  params: unknown,
  adapter: IPremiereAdapter,
  options: DispatchOptions = {}
): Promise<unknown> {
  const handler = handlers[method];
  if (!handler) {
    throw new Error(`Unknown RPC method: ${method}`);
  }
  // Early-out if the caller already cancelled — don't even validate.
  if (options.signal?.aborted) {
    throw new AbortError(options.signal.reason);
  }
  const parsed = handler.schema.parse(params ?? {});
  const autoUndo = options.autoUndoGroup ?? true;
  const useRetry = options.retry ?? true;
  const signal = options.signal;
  const cache = options.cache;

  const exec = (): Promise<unknown> => handler.run(parsed, adapter);
  const undoWrapped = (): Promise<unknown> =>
    autoUndo ? runWithAutoUndo(method, adapter, exec) : exec();
  const withRetryWrap = (): Promise<unknown> =>
    useRetry ? withRetry(undoWrapped, { signal }) : undoWrapped();

  // Cache hot path — read methods only, miss falls through to withRetry.
  if (cache && CACHEABLE_METHODS.has(method)) {
    return cache.getOrCompute(method, params, withRetryWrap);
  }

  // Mutating methods invalidate cache entries after they succeed.
  if (cache && INVALIDATIONS[method]) {
    const result = await withRetryWrap();
    cache.invalidate(INVALIDATIONS[method]);
    return result;
  }

  return withRetryWrap();
}

export function listRpcMethods(): readonly string[] {
  return Object.keys(handlers);
}

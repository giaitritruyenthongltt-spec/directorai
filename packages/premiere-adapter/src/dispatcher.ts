import { z } from 'zod';
import type { Seconds } from '@directorai/core';
import type { IPremiereAdapter } from './types.js';

interface RpcHandler {
  schema: z.ZodTypeAny;
  run: (params: unknown, adapter: IPremiereAdapter) => Promise<unknown>;
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
    schema: z.object({
      clipId: z.string(),
      exposure: z.number().optional(),
      contrast: z.number().optional(),
      highlights: z.number().optional(),
      shadows: z.number().optional(),
      saturation: z.number().optional(),
      temperature: z.number().optional(),
    }),
    run: (p, a) => a.setColorParams(p as Parameters<IPremiereAdapter['setColorParams']>[0]),
  },

  'audio.setGain': {
    schema: z.object({ clipId: z.string(), gainDb: z.number() }),
    run: (p, a) => a.setAudioGain(p as { clipId: string; gainDb: number }),
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

export async function dispatchRpc(
  method: string,
  params: unknown,
  adapter: IPremiereAdapter
): Promise<unknown> {
  const handler = handlers[method];
  if (!handler) {
    throw new Error(`Unknown RPC method: ${method}`);
  }
  const parsed = handler.schema.parse(params ?? {});
  return handler.run(parsed, adapter);
}

export function listRpcMethods(): readonly string[] {
  return Object.keys(handlers);
}

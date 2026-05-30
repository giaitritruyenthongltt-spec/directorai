/**
 * Server-side router for `style.*` RPC methods.
 *
 * Methods:
 *   style.list              — list built-in style names
 *   style.get               — get a built-in style by name
 *   style.parse             — parse a YAML string → Style
 *   style.plan              — build a Plan from style + context (no execution)
 *   style.apply             — plan + execute against routed adapter
 *   style.dryRun            — plan + dry-run executor (no mutation)
 */

import { z } from 'zod';
import type { Logger } from '@directorai/shared';
import {
  getBuiltinStyle,
  listBuiltinStyles,
  parseStyle,
  BUILTIN_STYLES,
} from '@directorai/style-engine';
import {
  planCuts,
  executePlan,
  formatExecutionReport,
  type MediaContext,
} from '@directorai/cut-planner';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import type { CheckpointStore } from './checkpoint-store.js';

const ContextSchema = z.object({
  mediaPath: z.string(),
  durationSec: z.number().nonnegative(),
  segments: z
    .array(
      z.object({
        start: z.number().nonnegative(),
        end: z.number().nonnegative(),
        text: z.string(),
        isFiller: z.boolean().optional(),
        isSilence: z.boolean().optional(),
      })
    )
    .default([]),
  scenes: z.array(z.object({ start: z.number(), end: z.number() })).default([]),
  beats: z.array(z.number()).optional(),
});

const StyleRef = z.union([
  z.object({ name: z.string() }), // built-in name
  z.object({ yaml: z.string() }), // raw YAML
]);

const PlanInputSchema = z.object({
  style: StyleRef,
  context: ContextSchema,
});

const ApplyInputSchema = PlanInputSchema.extend({
  dryRun: z.boolean().optional().default(false),
  stopOnError: z.boolean().optional().default(false),
});

function resolveStyle(ref: z.infer<typeof StyleRef>) {
  if ('name' in ref) return getBuiltinStyle(ref.name);
  return parseStyle(ref.yaml);
}

function toMediaContext(ctx: z.infer<typeof ContextSchema>): MediaContext {
  return {
    mediaPath: ctx.mediaPath,
    durationSec: ctx.durationSec as MediaContext['durationSec'],
    segments: ctx.segments.map((s) => ({
      start: s.start as MediaContext['segments'][number]['start'],
      end: s.end as MediaContext['segments'][number]['end'],
      text: s.text,
      isFiller: s.isFiller,
      isSilence: s.isSilence,
    })),
    scenes: ctx.scenes.map((s) => ({
      start: s.start as MediaContext['scenes'][number]['start'],
      end: s.end as MediaContext['scenes'][number]['end'],
    })),
    beats: ctx.beats?.map((b) => b as MediaContext['durationSec']),
  };
}

export interface CreateStyleRouterOptions {
  logger?: Logger;
  /** Resolves the adapter to execute against (routed/mock). */
  adapter: () => IPremiereAdapter;
  /**
   * Optional checkpoint store (P4.06+P4.07). When provided, style.apply
   * snapshots the current sequence right before executing the plan so
   * the panel can recover state after a crash.
   */
  checkpoints?: CheckpointStore;
}

export function createStyleRouter(opts: CreateStyleRouterOptions) {
  const handlers: Record<
    string,
    { schema: z.ZodTypeAny; run: (params: unknown) => Promise<unknown> }
  > = {
    'style.list': {
      schema: z.object({}).optional(),
      run: async () => ({ styles: listBuiltinStyles() }),
    },
    'style.get': {
      schema: z.object({ name: z.string() }),
      run: async (p) => getBuiltinStyle((p as { name: string }).name),
    },
    'style.parse': {
      schema: z.object({ yaml: z.string() }),
      run: async (p) => parseStyle((p as { yaml: string }).yaml),
    },
    'style.plan': {
      schema: PlanInputSchema,
      run: async (p) => {
        const input = p as z.infer<typeof PlanInputSchema>;
        const style = resolveStyle(input.style);
        return planCuts({ style, context: toMediaContext(input.context) });
      },
    },
    'style.dryRun': {
      schema: ApplyInputSchema,
      run: async (p) => {
        const input = p as z.infer<typeof ApplyInputSchema>;
        const style = resolveStyle(input.style);
        const plan = planCuts({ style, context: toMediaContext(input.context) });
        const result = await executePlan(plan, opts.adapter(), {
          dryRun: true,
        });
        return { ...result, report: formatExecutionReport(result) };
      },
    },
    'style.apply': {
      schema: ApplyInputSchema,
      run: async (p) => {
        const input = p as z.infer<typeof ApplyInputSchema>;
        const style = resolveStyle(input.style);
        const plan = planCuts({ style, context: toMediaContext(input.context) });
        const adapter = opts.adapter();

        let checkpointId: string | undefined;
        if (opts.checkpoints && !input.dryRun) {
          try {
            const meta = await opts.checkpoints.snapshot(adapter, `style-${style.name}`);
            checkpointId = meta.id;
          } catch (err) {
            opts.logger?.warn({ err }, 'checkpoint snapshot failed — continuing');
          }
        }

        const result = await executePlan(plan, adapter, {
          dryRun: input.dryRun,
          stopOnError: input.stopOnError,
        });
        return { ...result, report: formatExecutionReport(result), checkpointId };
      },
    },
  };

  return {
    listMethods: (): readonly string[] => Object.keys(handlers),
    isStyleMethod: (m: string): boolean => m.startsWith('style.'),
    dispatch: async (method: string, params: unknown): Promise<unknown> => {
      const h = handlers[method];
      if (!h) throw new Error(`Unknown style method: ${method}`);
      const parsed = h.schema.parse(params ?? {});
      opts.logger?.debug({ method }, 'style.dispatch');
      return h.run(parsed);
    },
  };
}

export const STYLE_TOOL_DESCRIPTIONS: Record<string, string> = {
  'style.list': 'List the built-in style preset names.',
  'style.get': 'Get a built-in style by name.',
  'style.parse': 'Parse a YAML string into a validated Style.',
  'style.plan': 'Build a deterministic Plan from a style + media context (no execution).',
  'style.dryRun': 'Build a Plan and report what would happen, without mutating Premiere.',
  'style.apply':
    'Build a Plan and execute it against the active Premiere project. Returns the audit trail.',
};

// Re-export so other server modules can list built-in style names without
// importing @directorai/style-engine directly.
export { BUILTIN_STYLES };

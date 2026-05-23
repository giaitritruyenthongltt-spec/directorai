/**
 * Server-side router for `context.*` RPC methods.
 * These don't belong on the Premiere adapter — they call into the Python
 * context-engine service over HTTP.
 *
 * Method catalog (all top-level WS RPC):
 *   context.transcribe      (media_path, language?)
 *   context.findScenes      (media_path, threshold?)
 *   context.findBeats       (media_path)
 *   context.analyzeVisual   (media_path, sample_interval_sec?)
 *   context.searchClips     (query, top_k?, media_path?, kind?)
 *   context.ingest          (media_path, enable_*)
 *   context.health          ()
 */

import { z } from 'zod';
import type { Logger } from '@directorai/shared';
import { ContextClient } from './context-client.js';

const TranscribeSchema = z.object({
  media_path: z.string(),
  language: z.string().optional(),
});

const SceneSchema = z.object({
  media_path: z.string(),
  threshold: z.number().positive().optional(),
});

const BeatSchema = z.object({ media_path: z.string() });

const VisionSchema = z.object({
  media_path: z.string(),
  sample_interval_sec: z.number().positive().optional(),
});

const SearchSchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(100).optional(),
  media_path: z.string().optional(),
  kind: z.enum(['transcript', 'vision', 'scene']).optional(),
});

const IngestSchema = z.object({
  media_path: z.string(),
  enable_transcribe: z.boolean().optional(),
  enable_scene: z.boolean().optional(),
  enable_beat: z.boolean().optional(),
  enable_vision: z.boolean().optional(),
});

const Empty = z.object({}).optional();

export interface CreateContextRouterOptions {
  baseUrl: string;
  logger?: Logger;
}

export type ContextHandler = (params: unknown) => Promise<unknown>;

export function createContextRouter(opts: CreateContextRouterOptions): {
  isContextMethod: (method: string) => boolean;
  dispatch: (method: string, params: unknown) => Promise<unknown>;
  listMethods: () => readonly string[];
} {
  const client = new ContextClient({ baseUrl: opts.baseUrl });

  const handlers: Record<string, { schema: z.ZodTypeAny; run: ContextHandler }> = {
    'context.transcribe': {
      schema: TranscribeSchema,
      run: (p) => {
        const v = p as z.infer<typeof TranscribeSchema>;
        return client.transcribe(v.media_path, v.language);
      },
    },
    'context.findScenes': {
      schema: SceneSchema,
      run: (p) => {
        const v = p as z.infer<typeof SceneSchema>;
        return client.findScenes(v.media_path, v.threshold);
      },
    },
    'context.findBeats': {
      schema: BeatSchema,
      run: (p) => client.findBeats((p as { media_path: string }).media_path),
    },
    'context.analyzeVisual': {
      schema: VisionSchema,
      run: (p) => {
        const v = p as z.infer<typeof VisionSchema>;
        return client.analyzeVisual(v.media_path, v.sample_interval_sec);
      },
    },
    'context.searchClips': {
      schema: SearchSchema,
      run: (p) => client.search(p as z.infer<typeof SearchSchema>),
    },
    'context.ingest': {
      schema: IngestSchema,
      run: (p) => client.ingest(p as z.infer<typeof IngestSchema>),
    },
    'context.health': {
      schema: Empty,
      run: () => client.health(),
    },
  };

  return {
    isContextMethod: (m) => m.startsWith('context.'),
    listMethods: () => Object.keys(handlers),
    dispatch: async (method, params) => {
      const h = handlers[method];
      if (!h) throw new Error(`Unknown context method: ${method}`);
      const parsed = h.schema.parse(params ?? {});
      opts.logger?.debug({ method }, 'context.dispatch');
      return h.run(parsed);
    },
  };
}

export const CONTEXT_TOOL_DESCRIPTIONS: Record<string, string> = {
  'context.transcribe': 'Transcribe audio/video to text with word-level timestamps (Whisper).',
  'context.findScenes': 'Detect scene boundaries in a video.',
  'context.findBeats': 'Detect musical beats + tempo (BPM) in audio.',
  'context.analyzeVisual': 'Sample video frames and describe each with vision LLM.',
  'context.searchClips':
    'Semantic search over transcripts/vision/scenes — top-K cosine similarity.',
  'context.ingest':
    'Run the full ingest pipeline (transcribe + scenes + beats + vision) on a media file.',
  'context.health': 'Check if the Python context-engine service is reachable.',
};

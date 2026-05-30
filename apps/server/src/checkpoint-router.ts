/**
 * P4.06 RPC surface for the checkpoint store.
 *
 * Methods:
 *   checkpoint.snapshot  { label }                  → CheckpointMetadata
 *   checkpoint.list      { }                        → CheckpointMetadata[]
 *   checkpoint.load      { id }                     → CheckpointPayload
 *   checkpoint.latest    { }                        → CheckpointPayload | null
 *   checkpoint.delete    { id }                     → { ok: true }
 *
 * Panel uses these for crash recovery (P4.07) — on reload it asks for
 * `checkpoint.latest`, then re-paints the UI from the snapshot before
 * the user reconnects to Premiere.
 */
import { z } from 'zod';
import type { Logger } from '@directorai/shared';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import { CheckpointStore } from './checkpoint-store.js';

export interface CheckpointRouterOptions {
  readonly logger: Logger;
  /** Lazy adapter resolver — same pattern as style-router. */
  readonly adapter: () => IPremiereAdapter;
  readonly store?: CheckpointStore;
}

const SnapshotParams = z.object({ label: z.string().min(1).max(80) });
const LoadParams = z.object({ id: z.string().min(1) });
const DeleteParams = z.object({ id: z.string().min(1) });
const EmptyParams = z.object({}).optional();

export interface CheckpointRouter {
  listMethods(): readonly string[];
  dispatch(method: string, params: unknown): Promise<unknown>;
}

export function createCheckpointRouter(opts: CheckpointRouterOptions): CheckpointRouter {
  const store = opts.store ?? new CheckpointStore();

  const handlers: Record<string, (p: unknown) => Promise<unknown>> = {
    'checkpoint.snapshot': async (p) => {
      const { label } = SnapshotParams.parse(p ?? {});
      return store.snapshot(opts.adapter(), label);
    },
    'checkpoint.list': async (p) => {
      EmptyParams.parse(p ?? {});
      return store.list();
    },
    'checkpoint.load': async (p) => {
      const { id } = LoadParams.parse(p ?? {});
      return store.load(id);
    },
    'checkpoint.latest': async (p) => {
      EmptyParams.parse(p ?? {});
      return store.latest();
    },
    'checkpoint.delete': async (p) => {
      const { id } = DeleteParams.parse(p ?? {});
      await store.delete(id);
      return { ok: true };
    },
  };

  return {
    listMethods: () => Object.keys(handlers),
    dispatch: async (method, params) => {
      const fn = handlers[method];
      if (!fn) throw new Error(`Unknown checkpoint method: ${method}`);
      opts.logger.debug?.({ method }, 'checkpoint RPC');
      return fn(params);
    },
  };
}

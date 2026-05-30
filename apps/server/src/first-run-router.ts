/**
 * P4.31 — First-run state RPC.
 *
 * Methods:
 *   firstRun.status                 → { done: boolean }
 *   firstRun.markDone               → { done: true }
 *   firstRun.setApiKey { key }      → { ok: true } (persists to ~/.directorai/api-key)
 *
 * State file: ~/.directorai/first-run.done (touch-file).
 * API key file: ~/.directorai/api-key (chmod 600 best-effort).
 *
 * The panel wizard (FirstRunWizard.tsx) only shows when `done === false`.
 */
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Logger } from '@directorai/shared';

export interface FirstRunRouterOptions {
  logger: Logger;
  stateDir?: string;
}

const SetKeyParams = z.object({ key: z.string().min(10).max(200) });
const EmptyParams = z.object({}).optional();

export interface FirstRunRouter {
  listMethods(): readonly string[];
  dispatch(method: string, params: unknown): Promise<unknown>;
}

const DEFAULT_DIR = path.join(os.homedir(), '.directorai');

export function createFirstRunRouter(opts: FirstRunRouterOptions): FirstRunRouter {
  const stateDir = opts.stateDir ?? DEFAULT_DIR;
  const doneFile = path.join(stateDir, 'first-run.done');
  const apiKeyFile = path.join(stateDir, 'api-key');

  const isDone = async (): Promise<boolean> => {
    try {
      await fs.access(doneFile);
      return true;
    } catch {
      return false;
    }
  };

  const markDone = async (): Promise<void> => {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(doneFile, new Date().toISOString(), 'utf8');
  };

  const handlers: Record<string, (p: unknown) => Promise<unknown>> = {
    'firstRun.status': async (p) => {
      EmptyParams.parse(p ?? {});
      return { done: await isDone() };
    },
    'firstRun.markDone': async (p) => {
      EmptyParams.parse(p ?? {});
      await markDone();
      opts.logger.info({}, 'first-run completed');
      return { done: true };
    },
    'firstRun.setApiKey': async (p) => {
      const { key } = SetKeyParams.parse(p ?? {});
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(apiKeyFile, key, { encoding: 'utf8', mode: 0o600 });
      opts.logger.info({}, 'api key stored');
      return { ok: true };
    },
  };

  return {
    listMethods: () => Object.keys(handlers),
    dispatch: async (method, params) => {
      const fn = handlers[method];
      if (!fn) throw new Error(`Unknown firstRun method: ${method}`);
      return fn(params);
    },
  };
}

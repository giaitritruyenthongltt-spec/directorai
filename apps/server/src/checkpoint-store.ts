/**
 * P4.06 — Checkpoint store.
 *
 * Snapshots the active sequence + project metadata into JSON on disk
 * before each plan execution. Subsequent panels (P4.07) can load the
 * latest snapshot to rebuild UI state after a crash, and the executor
 * can attach a checkpoint reference to every plan run for audit.
 *
 * Storage shape:
 *   ~/.directorai/checkpoints/
 *     {epoch}_{label}.json
 *
 * The on-disk format is intentionally a flat snapshot — no diff/CAS —
 * because PPro sequences are small relative to the cost of the actual
 * media files, and restore is a *read* operation, not a write back into
 * Premiere. Reverting an applied plan is still the user pressing
 * Ctrl-Z on the undo group (handled by P1).
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';

export interface CheckpointMetadata {
  readonly id: string;
  readonly label: string;
  readonly createdAt: number;
  readonly path: string;
}

export interface CheckpointPayload {
  readonly id: string;
  readonly label: string;
  readonly createdAt: number;
  readonly project: {
    readonly metadata: unknown;
  };
  readonly activeSequence: unknown | null;
}

export interface CheckpointStoreOptions {
  /** Override the root directory. Default: ~/.directorai/checkpoints */
  readonly root?: string;
  /** Maximum entries to keep before pruning oldest. Default: 50. */
  readonly maxEntries?: number;
}

const DEFAULT_ROOT = path.join(os.homedir(), '.directorai', 'checkpoints');
const DEFAULT_MAX = 50;

const safeLabel = (s: string): string =>
  s
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'unlabeled';

export class CheckpointStore {
  private readonly root: string;
  private readonly maxEntries: number;

  constructor(opts: CheckpointStoreOptions = {}) {
    this.root = opts.root ?? DEFAULT_ROOT;
    this.maxEntries = opts.maxEntries ?? DEFAULT_MAX;
  }

  /** Ensure the storage directory exists. */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  /**
   * Capture a snapshot of the active sequence and project metadata via
   * the given adapter, write it to disk, return the metadata pointer.
   */
  async snapshot(adapter: IPremiereAdapter, label: string): Promise<CheckpointMetadata> {
    await this.ensureDir();
    const id = `${Date.now()}_${safeLabel(label)}`;
    const file = path.join(this.root, `${id}.json`);

    const project = await adapter.getProject();
    const activeSequence = await adapter.getActiveSequence();

    const payload: CheckpointPayload = {
      id,
      label,
      createdAt: Date.now(),
      project: { metadata: project.metadata },
      activeSequence,
    };
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
    await this.prune();
    return { id, label, createdAt: payload.createdAt, path: file };
  }

  /** Load a stored checkpoint by id. */
  async load(id: string): Promise<CheckpointPayload> {
    const file = path.join(this.root, `${id}.json`);
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as CheckpointPayload;
  }

  /** List checkpoints newest first. */
  async list(): Promise<CheckpointMetadata[]> {
    await this.ensureDir();
    const entries = await fs.readdir(this.root);
    const out: CheckpointMetadata[] = [];
    for (const e of entries) {
      if (!e.endsWith('.json')) continue;
      const id = e.replace(/\.json$/, '');
      const m = id.match(/^(\d+)_(.+)$/);
      if (!m) continue;
      out.push({
        id,
        createdAt: Number(m[1]),
        label: m[2] ?? 'unlabeled',
        path: path.join(this.root, e),
      });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }

  /** Most recent checkpoint, or null if none exist. */
  async latest(): Promise<CheckpointPayload | null> {
    const all = await this.list();
    if (all.length === 0) return null;
    return this.load(all[0]!.id);
  }

  /** Remove a single checkpoint by id (no-op if missing). */
  async delete(id: string): Promise<void> {
    const file = path.join(this.root, `${id}.json`);
    await fs.rm(file, { force: true });
  }

  /** Drop oldest entries beyond maxEntries. */
  private async prune(): Promise<void> {
    const all = await this.list();
    if (all.length <= this.maxEntries) return;
    const drop = all.slice(this.maxEntries);
    await Promise.all(drop.map((c) => this.delete(c.id)));
  }
}

/**
 * F2 — Plan history persistence.
 *
 * Stores the rolling 50-entry plan history to a JSON file under the
 * user's home dir (or DIRECTORAI_DATA_DIR env) so director.refine
 * survives server restarts. Zero-deps — uses `node:fs/promises` only.
 *
 * Write strategy:
 *   - Save runs through a debounce so 10 rapid step-done events don't
 *     fsync 10 times. We batch into a 200ms window.
 *   - Crash-safe: write to <file>.tmp then rename atomically.
 *
 * Read strategy:
 *   - Lazy load on first access (or eager on `loadOrInit()`).
 *   - Missing / corrupt file → start fresh with empty history.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import type { Logger } from '@directorai/shared';
import type { director } from '@directorai/llm-client';

export interface PlanHistoryEntry {
  planId: string;
  title: string;
  persona: director.Persona;
  goal: string;
  stepCount: number;
  status: director.PlanStatus;
  createdAt: number;
  finishedAt?: number;
  /** Full plan JSON kept so refine + replay work. */
  plan: director.Plan;
}

interface PersistedShape {
  version: 1;
  history: PlanHistoryEntry[];
}

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 200;

export class PlanHistoryStore {
  private history: PlanHistoryEntry[] = [];
  private readonly path: string;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  constructor(
    private readonly logger: Logger,
    dataDir?: string
  ) {
    const root = dataDir ?? process.env.DIRECTORAI_DATA_DIR ?? join(homedir(), '.directorai');
    this.path = join(root, 'plan-history.json');
  }

  /** Read the on-disk file (or start empty). Idempotent. */
  async loadOrInit(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.path, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedShape>;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.history)) {
        this.history = parsed.history.slice(0, MAX_HISTORY);
        this.logger.info({ count: this.history.length, path: this.path }, 'plan history loaded');
      } else {
        this.logger.warn({ path: this.path }, 'plan history file has wrong shape — starting fresh');
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(
          { path: this.path, error: e instanceof Error ? e.message : String(e) },
          'plan history load failed — starting fresh'
        );
      }
    }
    this.loaded = true;
  }

  /** Append a new entry (latest first), trim to MAX_HISTORY, schedule a save. */
  add(entry: PlanHistoryEntry): void {
    this.history.unshift(entry);
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
    this.scheduleSave();
  }

  /** Patch an existing entry (e.g. set finishedAt + status), schedule a save. */
  update(planId: string, patch: Partial<PlanHistoryEntry>): void {
    const e = this.history.find((h) => h.planId === planId);
    if (!e) return;
    Object.assign(e, patch);
    this.scheduleSave();
  }

  find(planId: string): PlanHistoryEntry | undefined {
    return this.history.find((h) => h.planId === planId);
  }

  list(limit: number): PlanHistoryEntry[] {
    return this.history.slice(0, Math.min(limit, MAX_HISTORY));
  }

  totalCount(): number {
    return this.history.length;
  }

  /** Force a synchronous save now (await it). Used at shutdown. */
  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    await this.save();
  }

  private scheduleSave(): void {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.save().catch((e) => {
        this.logger.error(
          { error: e instanceof Error ? e.message : String(e) },
          'plan history save failed'
        );
      });
    }, DEBOUNCE_MS);
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    const data: PersistedShape = { version: 1, history: this.history };
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await rename(tmp, this.path);
  }
}

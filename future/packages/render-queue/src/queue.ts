/**
 * P5.05b — Render job queue + dispatcher.
 *
 * Schema:
 *   { id, kind, payload, status, attempts, createdAt, startedAt?,
 *     finishedAt?, error?, costMinutes?, mediaSha256? }
 *
 * Statuses: queued → running → done | failed | cancelled
 *
 * Backend is pluggable (`IJobBackend`); ships with `InMemoryBackend`.
 * The production worker (P5.05a Dockerfile) reads from a Redis or
 * Postgres backend depending on deployment choice. The dispatcher
 * is the same code either way.
 *
 * Privacy (P5.05c): the queue never carries media bytes — only
 * sha256-content-addressed paths that the worker hydrates from a
 * short-lived signed URL. Media auto-purges after job done.
 */
import { z } from 'zod';

export const JobStatusSchema = z.enum(['queued', 'running', 'done', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: z.string().uuid(),
  /** "transcribe" / "scene" / "vision" / "beats" — context-engine kinds today. */
  kind: z.string().min(1).max(40),
  /** Job-specific payload; the worker knows the shape. */
  payload: z.unknown(),
  status: JobStatusSchema,
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  /** Billable minutes — populated by the worker on finish (P5.05d). */
  costMinutes: z.number().nonnegative().optional(),
  /** Content-addressed media id; worker fetches via signed URL (P5.05c). */
  mediaSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
});
export type Job = z.infer<typeof JobSchema>;

export interface EnqueueInput {
  kind: string;
  payload: unknown;
  mediaSha256?: string;
}

export interface IJobBackend {
  enqueue(j: Omit<Job, 'attempts' | 'status' | 'createdAt'>): Promise<Job>;
  next(): Promise<Job | null>;
  update(id: string, patch: Partial<Job>): Promise<Job | null>;
  get(id: string): Promise<Job | null>;
  list(filter?: { status?: JobStatus }): Promise<readonly Job[]>;
}

export class InMemoryBackend implements IJobBackend {
  private rows = new Map<string, Job>();
  async enqueue(j: Omit<Job, 'attempts' | 'status' | 'createdAt'>): Promise<Job> {
    const row: Job = {
      ...j,
      status: 'queued',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    this.rows.set(row.id, row);
    return row;
  }
  async next(): Promise<Job | null> {
    for (const j of this.rows.values()) {
      if (j.status === 'queued') {
        const claimed = {
          ...j,
          status: 'running' as const,
          attempts: j.attempts + 1,
          startedAt: new Date().toISOString(),
        };
        this.rows.set(j.id, claimed);
        return claimed;
      }
    }
    return null;
  }
  async update(id: string, patch: Partial<Job>): Promise<Job | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const next = { ...row, ...patch };
    this.rows.set(id, next);
    return next;
  }
  async get(id: string): Promise<Job | null> {
    return this.rows.get(id) ?? null;
  }
  async list(filter: { status?: JobStatus } = {}): Promise<readonly Job[]> {
    let out = [...this.rows.values()];
    if (filter.status) out = out.filter((j) => j.status === filter.status);
    return out;
  }
}

export interface DispatcherOptions {
  backend: IJobBackend;
  /** Random uuid generator; tests inject a deterministic version. */
  uuid: () => string;
}

export class RenderQueue {
  constructor(private readonly opts: DispatcherOptions) {}

  enqueue(input: EnqueueInput): Promise<Job> {
    return this.opts.backend.enqueue({
      id: this.opts.uuid(),
      kind: input.kind,
      payload: input.payload,
      mediaSha256: input.mediaSha256,
    });
  }

  async runOne<T>(handler: (j: Job) => Promise<T>): Promise<Job | null> {
    const job = await this.opts.backend.next();
    if (!job) return null;
    try {
      const result = await handler(job);
      const costMinutes = (result as { costMinutes?: number })?.costMinutes;
      return this.opts.backend.update(job.id, {
        status: 'done',
        finishedAt: new Date().toISOString(),
        costMinutes: typeof costMinutes === 'number' ? costMinutes : undefined,
      });
    } catch (err) {
      return this.opts.backend.update(job.id, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  cancel(id: string): Promise<Job | null> {
    return this.opts.backend.update(id, {
      status: 'cancelled',
      finishedAt: new Date().toISOString(),
    });
  }

  status(id: string): Promise<Job | null> {
    return this.opts.backend.get(id);
  }

  list(filter?: { status?: JobStatus }): Promise<readonly Job[]> {
    return this.opts.backend.list(filter);
  }
}

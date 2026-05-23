/**
 * Generic exponential-backoff retry for transient adapter failures.
 *
 * Errors are classified by the caller-supplied `isTransient` predicate.
 * Non-transient errors bubble up immediately.
 */

export interface RetryOptions {
  readonly maxAttempts?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly backoffFactor?: number;
  readonly isTransient?: (err: unknown) => boolean;
}

const DEFAULTS = {
  maxAttempts: 3,
  initialDelayMs: 200,
  maxDelayMs: 2_000,
  backoffFactor: 2,
} as const;

const DEFAULT_TRANSIENT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /busy/i,
  /locked/i,
  /econnreset/i,
  /econnrefused/i,
  /scene is being used/i,
  /try again/i,
];

export function isDefaultTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return DEFAULT_TRANSIENT_PATTERNS.some((re) => re.test(msg));
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts;
  const initialDelayMs = opts.initialDelayMs ?? DEFAULTS.initialDelayMs;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const factor = opts.backoffFactor ?? DEFAULTS.backoffFactor;
  const isTransient = opts.isTransient ?? isDefaultTransient;

  let attempt = 0;
  let delay = initialDelayMs;
  let lastErr: unknown;

  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt >= maxAttempts || !isTransient(err)) throw err;
      await sleep(delay);
      delay = Math.min(delay * factor, maxDelayMs);
    }
  }
  throw lastErr;
}

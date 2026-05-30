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
  /**
   * Optional cancellation signal. If aborted between attempts the retry
   * loop exits and throws an AbortError. Aborts during the inner fn()
   * are surfaced as whatever the fn throws.
   */
  readonly signal?: AbortSignal;
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

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError(signal.reason));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AbortError(signal?.reason));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** Thrown when a withRetry / dispatch / executor call is aborted via AbortSignal. */
export class AbortError extends Error {
  override readonly name = 'AbortError';
  readonly cancelled = true as const;
  constructor(reason?: unknown) {
    super(reason instanceof Error ? reason.message : 'Operation aborted');
  }
}

export function isAbortError(err: unknown): err is AbortError {
  return (
    err instanceof AbortError ||
    (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError')
  );
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts;
  const initialDelayMs = opts.initialDelayMs ?? DEFAULTS.initialDelayMs;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const factor = opts.backoffFactor ?? DEFAULTS.backoffFactor;
  const isTransient = opts.isTransient ?? isDefaultTransient;
  const signal = opts.signal;

  let attempt = 0;
  let delay = initialDelayMs;
  let lastErr: unknown;

  while (attempt < maxAttempts) {
    if (signal?.aborted) throw new AbortError(signal.reason);
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      attempt++;
      if (isAbortError(err)) throw err;
      if (attempt >= maxAttempts || !isTransient(err)) throw err;
      await sleep(delay, signal);
      delay = Math.min(delay * factor, maxDelayMs);
    }
  }
  throw lastErr;
}

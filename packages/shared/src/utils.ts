export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const { attempts = 3, baseDelayMs = 200, maxDelayMs = 5000 } = options;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) break;
      const delay = Math.min(baseDelayMs * 2 ** i, maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastError;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepFreeze<T>(obj: T): Readonly<T> {
  if (isObject(obj)) {
    for (const key of Object.keys(obj)) {
      const val = (obj as Record<string, unknown>)[key];
      if (isObject(val) || Array.isArray(val)) {
        deepFreeze(val);
      }
    }
  }
  return Object.freeze(obj);
}

export function uniqueId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

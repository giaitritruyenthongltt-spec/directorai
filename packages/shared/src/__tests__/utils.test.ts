import { describe, it, expect } from 'vitest';
import { clamp, isObject, retry, sleep, uniqueId } from '../utils.js';

describe('clamp', () => {
  it('returns the value when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps below minimum', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });
  it('clamps above maximum', () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('isObject', () => {
  it('detects plain objects', () => {
    expect(isObject({})).toBe(true);
  });
  it('rejects arrays', () => {
    expect(isObject([])).toBe(false);
  });
  it('rejects null', () => {
    expect(isObject(null)).toBe(false);
  });
});

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(18);
  });
});

describe('retry', () => {
  it('succeeds on first attempt', async () => {
    const result = await retry(async () => 'ok');
    expect(result).toBe('ok');
  });
  it('retries on failure then succeeds', async () => {
    let count = 0;
    const result = await retry(
      async () => {
        count++;
        if (count < 3) throw new Error('fail');
        return 'recovered';
      },
      { attempts: 5, baseDelayMs: 1 }
    );
    expect(result).toBe('recovered');
    expect(count).toBe(3);
  });
  it('throws after exhausting attempts', async () => {
    await expect(
      retry(
        async () => {
          throw new Error('always fails');
        },
        { attempts: 2, baseDelayMs: 1 }
      )
    ).rejects.toThrow('always fails');
  });
});

describe('uniqueId', () => {
  it('produces a unique id with the prefix', () => {
    const a = uniqueId('test');
    const b = uniqueId('test');
    expect(a).toMatch(/^test_/);
    expect(a).not.toBe(b);
  });
});

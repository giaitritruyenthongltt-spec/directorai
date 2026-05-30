import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFirstRunRouter } from '../first-run-router.js';

const noop = (..._args: unknown[]): void => void _args;
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: (): never => silentLogger as never,
};

describe('first-run router (P4.31)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'da-fr-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('status returns done=false initially', async () => {
    const r = createFirstRunRouter({ logger: silentLogger as never, stateDir: dir });
    const s = (await r.dispatch('firstRun.status', {})) as { done: boolean };
    expect(s.done).toBe(false);
  });

  it('markDone persists across instances', async () => {
    const r1 = createFirstRunRouter({ logger: silentLogger as never, stateDir: dir });
    await r1.dispatch('firstRun.markDone', {});
    const r2 = createFirstRunRouter({ logger: silentLogger as never, stateDir: dir });
    const s = (await r2.dispatch('firstRun.status', {})) as { done: boolean };
    expect(s.done).toBe(true);
  });

  it('setApiKey writes the key file', async () => {
    const r = createFirstRunRouter({ logger: silentLogger as never, stateDir: dir });
    await r.dispatch('firstRun.setApiKey', { key: 'sk-ant-1234567890' });
    const stored = await fs.readFile(path.join(dir, 'api-key'), 'utf8');
    expect(stored).toBe('sk-ant-1234567890');
  });

  it('setApiKey rejects too-short keys', async () => {
    const r = createFirstRunRouter({ logger: silentLogger as never, stateDir: dir });
    await expect(r.dispatch('firstRun.setApiKey', { key: 'short' })).rejects.toThrow();
  });
});

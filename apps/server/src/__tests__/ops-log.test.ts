import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OpsLog, lean } from '../ops-log.js';

function readEvents(dir: string): Record<string, unknown>[] {
  const p = join(dir, 'ops.log');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('lean()', () => {
  it('lược các field khổng lồ (tracks/markers/clips) thành "[N mục — lược]"', () => {
    const out = lean({ name: 'seq', tracks: [1, 2, 3], markers: [{ a: 1 }] }) as Record<
      string,
      unknown
    >;
    expect(out.name).toBe('seq');
    expect(out.tracks).toBe('[3 mục — lược]');
    expect(out.markers).toBe('[1 mục — lược]');
  });

  it('cắt chuỗi quá dài + giữ nguyên giá trị nhỏ', () => {
    const long = 'x'.repeat(500);
    expect(String(lean(long))).toContain('…(+');
    expect(lean('short')).toBe('short');
    expect(lean(42)).toBe(42);
    expect(lean(null)).toBeNull();
  });
});

describe('OpsLog.recordMutation', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opslog-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ok=true → event "mutate" với adapter/params/result', () => {
    const log = new OpsLog(dir);
    log.recordMutation({
      rid: 'r1',
      method: 'timeline.trimClip',
      adapter: 'real',
      ok: true,
      durationMs: 12,
      params: { clipId: 'v0', outSec: 4.5 },
      result: { outSec: 4.5 },
    });
    const ev = readEvents(dir);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event: 'mutate',
      rid: 'r1',
      method: 'timeline.trimClip',
      adapter: 'real',
      ok: true,
      durationMs: 12,
    });
    expect(ev[0].params).toMatchObject({ clipId: 'v0', outSec: 4.5 });
    expect(ev[0].mockWarning).toBeUndefined();
  });

  it('ok=false → event "mutate.error" + error, KHÔNG có result', () => {
    const log = new OpsLog(dir);
    log.recordMutation({
      rid: 'r2',
      method: 'timeline.moveClip',
      adapter: 'real',
      ok: false,
      durationMs: 3,
      params: { clipId: 'v0' },
      result: { should: 'not appear' },
      error: 'Connection to object lost',
    });
    const ev = readEvents(dir);
    expect(ev[0].event).toBe('mutate.error');
    expect(ev[0].error).toBe('Connection to object lost');
    expect(ev[0].result).toBeUndefined();
  });

  it('adapter=mock → có mockWarning (cảnh báo không đụng timeline)', () => {
    const log = new OpsLog(dir);
    log.recordMutation({
      rid: 'r3',
      method: 'effect.apply',
      adapter: 'mock',
      ok: true,
      durationMs: 1,
    });
    const ev = readEvents(dir);
    expect(ev[0].adapter).toBe('mock');
    expect(ev[0].mockWarning).toBeTruthy();
  });
});

describe('OpsLog rotation', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'opslog-rot-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('vượt ngưỡng → xoay vòng sang ops.log.1, ops.log reset', () => {
    const log = new OpsLog(dir, 200); // cap 200 bytes
    for (let i = 0; i < 20; i++) {
      log.record({ event: 'test', i, pad: 'y'.repeat(20) });
    }
    expect(existsSync(join(dir, 'ops.log.1'))).toBe(true);
    // file hiện tại nhỏ hơn (đã reset ít nhất 1 lần)
    const cur = readFileSync(join(dir, 'ops.log'), 'utf-8');
    expect(cur.length).toBeLessThan(20 * 40);
  });
});

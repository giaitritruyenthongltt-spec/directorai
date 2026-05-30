/**
 * P4.06 — CheckpointStore round-trip tests using a temp directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MockPremiereAdapter } from '@directorai/premiere-adapter';
import { CheckpointStore } from '../checkpoint-store.js';

async function tmpRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'da-ckpt-'));
}

describe('CheckpointStore (P4.06)', () => {
  let root: string;
  let adapter: MockPremiereAdapter;

  beforeEach(async () => {
    root = await tmpRoot();
    adapter = new MockPremiereAdapter();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('snapshot writes a JSON file and returns metadata', async () => {
    const store = new CheckpointStore({ root });
    const meta = await store.snapshot(adapter, 'before-plan');

    expect(meta.id).toMatch(/^\d+_before-plan$/);
    expect(meta.label).toBe('before-plan');
    const raw = await fs.readFile(meta.path, 'utf8');
    const payload = JSON.parse(raw) as { project: unknown; activeSequence: unknown };
    expect(payload.project).toBeDefined();
    expect(payload.activeSequence).not.toBeNull();
  });

  it('list returns newest first', async () => {
    const store = new CheckpointStore({ root });
    const a = await store.snapshot(adapter, 'a');
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.snapshot(adapter, 'b');
    const items = await store.list();
    expect(items[0]!.id).toBe(b.id);
    expect(items[1]!.id).toBe(a.id);
  });

  it('latest() returns null when store is empty', async () => {
    const store = new CheckpointStore({ root });
    expect(await store.latest()).toBeNull();
  });

  it('latest() returns the most recent payload', async () => {
    const store = new CheckpointStore({ root });
    await store.snapshot(adapter, 'first');
    await new Promise((r) => setTimeout(r, 5));
    await store.snapshot(adapter, 'second');
    const latest = await store.latest();
    expect(latest?.label).toBe('second');
  });

  it('load round-trips an exact payload', async () => {
    const store = new CheckpointStore({ root });
    const meta = await store.snapshot(adapter, 'roundtrip');
    const loaded = await store.load(meta.id);
    expect(loaded.id).toBe(meta.id);
    expect(loaded.label).toBe('roundtrip');
    expect(loaded.activeSequence).not.toBeNull();
  });

  it('delete removes a checkpoint without affecting siblings', async () => {
    const store = new CheckpointStore({ root });
    const a = await store.snapshot(adapter, 'keep-me');
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.snapshot(adapter, 'drop-me');
    await store.delete(b.id);
    const items = await store.list();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(a.id);
  });

  it('prune drops oldest entries beyond maxEntries', async () => {
    const store = new CheckpointStore({ root, maxEntries: 3 });
    for (let i = 0; i < 6; i++) {
      await store.snapshot(adapter, `x${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const items = await store.list();
    expect(items).toHaveLength(3);
    // newest 3 retained, labels x5,x4,x3
    expect(items.map((c) => c.label)).toEqual(['x5', 'x4', 'x3']);
  });

  it('sanitises unsafe characters in labels', async () => {
    const store = new CheckpointStore({ root });
    const meta = await store.snapshot(adapter, 'plan!/with weird:chars*');
    expect(meta.id).toMatch(/^\d+_plan-with-weird-chars$/);
  });
});

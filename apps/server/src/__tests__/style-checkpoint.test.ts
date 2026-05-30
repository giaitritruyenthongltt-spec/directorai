/**
 * P4.07 — style.apply must snapshot before executing so the panel can
 * recover from a crash mid-plan.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MockPremiereAdapter } from '@directorai/premiere-adapter';
import { seconds, type Seconds } from '@directorai/core';
import { CheckpointStore } from '../checkpoint-store.js';
import { createStyleRouter } from '../style-router.js';

describe('P4.07 — style.apply checkpoint integration', () => {
  let root: string;
  let store: CheckpointStore;
  let adapter: MockPremiereAdapter;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'da-ckpt-style-'));
    store = new CheckpointStore({ root });
    adapter = new MockPremiereAdapter();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes a checkpoint before applying a plan and returns the checkpoint id', async () => {
    const router = createStyleRouter({
      adapter: () => adapter,
      checkpoints: store,
    });

    const before = (await store.list()).length;
    const result = (await router.dispatch('style.apply', {
      style: { name: 'vlog' },
      context: {
        mediaPath: 'C:\\sample.mp4',
        durationSec: seconds(60),
        segments: [
          { start: seconds(0), end: seconds(3), text: 'hello' },
          { start: seconds(3), end: seconds(30), text: 'main body about AI' },
        ],
        scenes: [{ start: seconds(0), end: seconds(30) }],
        beats: [seconds(5), seconds(10)] as Seconds[],
      },
    })) as { checkpointId?: string };

    const after = await store.list();
    expect(after.length).toBe(before + 1);
    expect(result.checkpointId).toBeDefined();
    expect(after[0]!.id).toBe(result.checkpointId);
    expect(after[0]!.label).toMatch(/^style-/i);
  });

  it('does NOT write a checkpoint for dry-run', async () => {
    const router = createStyleRouter({
      adapter: () => adapter,
      checkpoints: store,
    });
    const result = (await router.dispatch('style.apply', {
      style: { name: 'vlog' },
      dryRun: true,
      context: {
        mediaPath: 'C:\\sample.mp4',
        durationSec: seconds(60),
        segments: [{ start: seconds(0), end: seconds(3), text: 'hello' }],
        scenes: [{ start: seconds(0), end: seconds(30) }],
      },
    })) as { checkpointId?: string };
    expect(result.checkpointId).toBeUndefined();
    expect((await store.list()).length).toBe(0);
  });
});

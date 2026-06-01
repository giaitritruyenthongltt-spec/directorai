/**
 * SAFE-1c — Tests for applyResolvedPlan + safe.applyPlan (Tầng an toàn).
 *
 * Dùng MockPremiereAdapter (không cần Premiere/sidecar). Kiểm:
 * - cổng duyệt: ghi thật cần approved=true, không thì tự hạ dry-run
 * - executor: disable/rename ghi thật; trim/move/transition defer
 * - unresolved → skipped
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger } from '@directorai/shared';
import { MockPremiereAdapter } from '@directorai/premiere-adapter';
import { CompositeTools } from '../director-tools.js';
import type { EditPlan } from '../director-tools.js';

const logger = createLogger({ name: 'test', level: 'error' });

async function setup(): Promise<{
  adapter: MockPremiereAdapter;
  tools: CompositeTools;
  seqId: string;
  clipPath: string;
  clipId: string;
}> {
  const adapter = new MockPremiereAdapter();
  const seq = await adapter.getActiveSequence();
  if (!seq) throw new Error('mock thiếu sequence');
  // Mock seed track V1 rỗng → import 1 clip có path biết trước.
  await adapter.importFile({ path: 'E:\\T11\\6.mp4' });
  const clips = await adapter.listClips(seq.id);
  const first = clips[0]!;
  return {
    adapter,
    tools: new CompositeTools({ adapter, logger }),
    seqId: seq.id,
    clipPath: first.source.path,
    clipId: first.id,
  };
}

function planWith(steps: EditPlan['steps']): EditPlan {
  return {
    goal_understanding: 'g',
    strategy: 's',
    steps,
    out_of_scope: [],
    estimated_impact: 'i',
    requires_preview: true,
    confidence: 0.9,
  };
}

describe('safe.applyPlan — cổng duyệt', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('dryRun=false NHƯNG không approved → tự hạ về dry-run, KHÔNG ghi', async () => {
    const plan = planWith([
      {
        order: 1,
        action: 'disable',
        target_path: ctx.clipPath,
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    const res = await ctx.tools.applyPlan({
      sequenceId: ctx.seqId,
      editPlan: plan,
      dryRun: false,
      approved: false,
    });
    expect(res.dryRun).toBe(true);
    expect(res.approvalNote).toContain('approved=true');
    expect(res.applied).toBe(0);
    // clip vẫn enabled (chưa ghi)
    const clip = await ctx.adapter.getClip(ctx.clipId);
    expect(clip?.enabled).toBe(true);
  });

  it('approved=true → GHI THẬT disable', async () => {
    const plan = planWith([
      {
        order: 1,
        action: 'disable',
        target_path: ctx.clipPath,
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    const res = await ctx.tools.applyPlan({
      sequenceId: ctx.seqId,
      editPlan: plan,
      dryRun: false,
      approved: true,
    });
    expect(res.dryRun).toBe(false);
    expect(res.applied).toBe(1);
    const clip = await ctx.adapter.getClip(ctx.clipId);
    expect(clip?.enabled).toBe(false); // đã tắt
  });

  it('approved=true → GHI THẬT rename', async () => {
    const plan = planWith([
      {
        order: 1,
        action: 'rename',
        target_path: ctx.clipPath,
        params: { new_name: 'Hit_Climax' },
        reason: 'r',
        reversible: true,
      },
    ]);
    const res = await ctx.tools.applyPlan({
      sequenceId: ctx.seqId,
      editPlan: plan,
      dryRun: false,
      approved: true,
    });
    expect(res.applied).toBe(1);
    const clip = await ctx.adapter.getClip(ctx.clipId);
    expect(clip?.name).toBe('Hit_Climax');
  });

  it('trim/move/transition → DEFER (không ghi, báo rõ)', async () => {
    const plan = planWith([
      {
        order: 1,
        action: 'trim',
        target_path: ctx.clipPath,
        params: { in_sec: 0, out_sec: 2 },
        reason: 'r',
        reversible: true,
      },
      {
        order: 2,
        action: 'move',
        target_path: ctx.clipPath,
        params: { to_index: 1 },
        reason: 'r',
        reversible: true,
      },
      {
        order: 3,
        action: 'transition',
        target_path: ctx.clipPath,
        params: { kind: 'Cut' },
        reason: 'r',
        reversible: true,
      },
    ]);
    const res = await ctx.tools.applyPlan({
      sequenceId: ctx.seqId,
      editPlan: plan,
      dryRun: false,
      approved: true,
    });
    expect(res.deferred).toBe(3);
    expect(res.applied).toBe(0);
  });

  it('clip không tồn tại → skipped', async () => {
    const plan = planWith([
      {
        order: 1,
        action: 'disable',
        target_path: 'X:\\nope\\ghost.mp4',
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    const res = await ctx.tools.applyPlan({
      sequenceId: ctx.seqId,
      editPlan: plan,
      dryRun: false,
      approved: true,
    });
    expect(res.skipped).toBe(1);
    expect(res.applied).toBe(0);
  });

  it('dryRun mặc định (không cờ) → mô phỏng, không ghi', async () => {
    const plan = planWith([
      {
        order: 1,
        action: 'disable',
        target_path: ctx.clipPath,
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    const res = await ctx.tools.applyPlan({ sequenceId: ctx.seqId, editPlan: plan });
    expect(res.dryRun).toBe(true);
    expect(res.dryRunCount).toBe(1);
    const clip = await ctx.adapter.getClip(ctx.clipId);
    expect(clip?.enabled).toBe(true);
  });
});

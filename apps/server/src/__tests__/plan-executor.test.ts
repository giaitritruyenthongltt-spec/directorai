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

  it('approved=true → GHI THẬT trim (setClipInOut, giữ vị trí)', async () => {
    const plan = planWith([
      {
        order: 1,
        action: 'trim',
        target_path: ctx.clipPath,
        params: { in_sec: 1, out_sec: 3 },
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
    // thời lượng on-timeline = out-in = 2s
    expect(clip!.timelineRange.end - clip!.timelineRange.start).toBeCloseTo(2, 5);
    expect(clip!.sourceRange.start).toBeCloseTo(1, 5);
  });

  it('move + transition → GHI THẬT (move ripple no-overlap; transition dissolve)', async () => {
    await ctx.adapter.importFile({ path: 'E:\\T11\\7.mp4' });
    const plan = planWith([
      {
        order: 1,
        action: 'move',
        target_path: ctx.clipPath, // clip đầu
        params: { to_index: 1 }, // đưa xuống sau
        reason: 'r',
        reversible: true,
      },
      {
        order: 2,
        action: 'transition',
        target_path: ctx.clipPath,
        params: { kind: 'dissolve', duration_sec: 0.5 },
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
    expect(res.applied).toBe(2); // move + transition
    expect(res.deferred).toBe(0);
    // không chồng lấn trên timeline sau move
    const clips = await ctx.adapter.listClips(ctx.seqId);
    const vid = clips
      .filter((c) => c.kind === 'video')
      .sort((a, b) => a.timelineRange.start - b.timelineRange.start);
    for (let i = 1; i < vid.length; i++) {
      expect(vid[i]!.timelineRange.start).toBeGreaterThanOrEqual(
        vid[i - 1]!.timelineRange.end - 1e-6
      );
    }
  });

  it('transition kind=Cut → applied (cắt thẳng, không thêm component)', async () => {
    const plan = planWith([
      {
        order: 1,
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
    expect(res.applied).toBe(1);
    expect(res.results[0]!.detail).toContain('cắt thẳng');
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

describe('safe.applyPlan — SAFE-2 checkpoint + report', () => {
  it('checkpoint tự động NGAY TRƯỚC khi ghi thật', async () => {
    const adapter = new MockPremiereAdapter();
    const seq = await adapter.getActiveSequence();
    await adapter.importFile({ path: 'E:\\T11\\6.mp4' });
    const clips = await adapter.listClips(seq!.id);
    const snaps: string[] = [];
    const checkpoints = {
      snapshot: async (_a: unknown, label: string) => {
        snaps.push(label);
        return { id: 'cp-1', label, createdAt: 0, path: '/x' };
      },
    } as unknown as Parameters<typeof CompositeTools>[0]['checkpoints'];
    const tools = new CompositeTools({ adapter, logger, checkpoints });
    const plan = planWith([
      {
        order: 1,
        action: 'disable',
        target_path: clips[0]!.source.path,
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    const res = await tools.applyPlan({
      sequenceId: seq!.id,
      editPlan: plan,
      dryRun: false,
      approved: true,
    });
    expect(snaps.length).toBe(1); // đã snapshot
    expect(res.checkpointId).toBe('cp-1');
    expect(res.applied).toBe(1);
  });

  it('checkpoint thất bại → HUỶ ghi (an toàn)', async () => {
    const adapter = new MockPremiereAdapter();
    const seq = await adapter.getActiveSequence();
    await adapter.importFile({ path: 'E:\\T11\\6.mp4' });
    const clips = await adapter.listClips(seq!.id);
    const checkpoints = {
      snapshot: async () => {
        throw new Error('disk full');
      },
    } as unknown as Parameters<typeof CompositeTools>[0]['checkpoints'];
    const tools = new CompositeTools({ adapter, logger, checkpoints });
    const plan = planWith([
      {
        order: 1,
        action: 'disable',
        target_path: clips[0]!.source.path,
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    await expect(
      tools.applyPlan({ sequenceId: seq!.id, editPlan: plan, dryRun: false, approved: true })
    ).rejects.toThrow(/checkpoint/i);
    // clip KHÔNG bị tắt (đã huỷ ghi)
    expect((await adapter.getClip(clips[0]!.id))?.enabled).toBe(true);
  });

  it('reportOnly → xuất file báo cáo, KHÔNG ghi', async () => {
    const adapter = new MockPremiereAdapter();
    const seq = await adapter.getActiveSequence();
    await adapter.importFile({ path: 'E:\\T11\\6.mp4' });
    const clips = await adapter.listClips(seq!.id);
    const tools = new CompositeTools({ adapter, logger });
    const plan = planWith([
      {
        order: 1,
        action: 'disable',
        target_path: clips[0]!.source.path,
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    const res = await tools.applyPlan({
      sequenceId: seq!.id,
      editPlan: plan,
      reportOnly: true,
    });
    expect(res.dryRun).toBe(true); // reportOnly ép dry-run
    expect(res.applied).toBe(0);
    expect(res.reportPath).toBeTruthy();
    expect((await adapter.getClip(clips[0]!.id))?.enabled).toBe(true);
  });
});

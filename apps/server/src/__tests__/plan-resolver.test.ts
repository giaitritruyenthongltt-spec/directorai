/**
 * SAFE-1b — Unit tests for resolvePlan (Tầng an toàn, read-only).
 *
 * Hàm thuần: khớp EditPlan (media_path) với Clip[] thật → preview. Test
 * mọi nhánh khớp/không-khớp/đa-khớp + executable theo action mà KHÔNG cần
 * timeline thật hay sidecar.
 */

import { describe, it, expect } from 'vitest';
import type { Clip } from '@directorai/core';
import { resolvePlan, EXECUTABLE_ACTIONS } from '../plan-resolver.js';
import type { EditPlan } from '../director-tools.js';

function clip(id: string, path: string, name: string): Clip {
  return {
    id,
    name,
    kind: 'video',
    trackId: 'video-1',
    timelineRange: { start: 0, end: 5 },
    sourceRange: { start: 0, end: 5 },
    source: { path, duration: 5, hasVideo: true, hasAudio: false },
    effects: [],
    enabled: true,
  };
}

function plan(steps: EditPlan['steps']): EditPlan {
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

const CLIPS: Clip[] = [
  clip('video-1:0', 'E:\\T11\\6.mp4', 'Hit_Fall'),
  clip('video-1:1', 'E:\\T11\\DJI_20251126100842_0003_D.MP4', 'Intro'),
  clip('video-1:2', 'E:\\T11\\2.mp4', 'Chain_Pose'),
];

describe('resolvePlan', () => {
  it('khớp theo full path (đổi separator/case)', () => {
    const p = plan([
      {
        order: 1,
        action: 'disable',
        target_path: 'e:/t11/6.mp4',
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    const out = resolvePlan(p, CLIPS, 'seq-1');
    expect(out.steps[0]!.resolved).toBe(true);
    expect(out.steps[0]!.clipId).toBe('video-1:0');
    expect(out.steps[0]!.executable).toBe(true);
    expect(out.resolvedCount).toBe(1);
    expect(out.requiresApproval).toBe(true);
  });

  it('khớp theo basename khi path khác thư mục', () => {
    const p = plan([
      {
        order: 1,
        action: 'trim',
        target_path: 'D:\\other\\dir\\2.mp4',
        params: { in_sec: 1, out_sec: 4 },
        reason: 'r',
        reversible: true,
      },
    ]);
    const out = resolvePlan(p, CLIPS, 'seq-1');
    expect(out.steps[0]!.resolved).toBe(true);
    expect(out.steps[0]!.clipId).toBe('video-1:2');
    expect(out.steps[0]!.description).toContain('1–4s');
  });

  it('đánh dấu unresolved khi không có clip', () => {
    const p = plan([
      {
        order: 1,
        action: 'disable',
        target_path: 'E:\\T11\\ghost.mp4',
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    const out = resolvePlan(p, CLIPS, 'seq-1');
    expect(out.steps[0]!.resolved).toBe(false);
    expect(out.steps[0]!.clipId).toBeNull();
    expect(out.steps[0]!.executable).toBe(false);
    expect(out.unresolvedCount).toBe(1);
    expect(out.unresolvedPaths).toContain('E:\\T11\\ghost.mp4');
    expect(out.steps[0]!.description).toContain('KHÔNG tìm thấy');
  });

  it('rename giờ executable (đã bổ sung renameClip — SAFE-1b)', () => {
    const p = plan([
      {
        order: 1,
        action: 'rename',
        target_path: 'E:\\T11\\6.mp4',
        params: { new_name: 'Hit' },
        reason: 'r',
        reversible: true,
      },
    ]);
    const out = resolvePlan(p, CLIPS, 'seq-1');
    expect(out.steps[0]!.resolved).toBe(true);
    expect(out.steps[0]!.executable).toBe(true);
    expect(out.steps[0]!.description).toContain('Đổi tên');
    expect(EXECUTABLE_ACTIONS.rename).toBe(true);
  });

  it('cảnh báo khi 1 file dùng nhiều lần trên timeline', () => {
    const dupClips = [...CLIPS, clip('video-1:3', 'E:\\T11\\6.mp4', 'Hit_Fall_copy')];
    const p = plan([
      {
        order: 1,
        action: 'move',
        target_path: '6.mp4',
        params: { to_index: 2 },
        reason: 'r',
        reversible: true,
      },
    ]);
    const out = resolvePlan(p, dupClips, 'seq-1');
    expect(out.steps[0]!.resolved).toBe(true);
    expect(out.steps[0]!.warning).toContain('khớp 2 clip');
  });

  it('đếm executable/resolved tổng hợp đúng', () => {
    const p = plan([
      {
        order: 1,
        action: 'disable',
        target_path: '6.mp4',
        params: {},
        reason: 'r',
        reversible: true,
      },
      {
        order: 2,
        action: 'rename',
        target_path: '2.mp4',
        params: { new_name: 'X' },
        reason: 'r',
        reversible: true,
      },
      {
        order: 3,
        action: 'trim',
        target_path: 'ghost.mp4',
        params: {},
        reason: 'r',
        reversible: true,
      },
    ]);
    const out = resolvePlan(p, CLIPS, 'seq-1');
    expect(out.totalSteps).toBe(3);
    expect(out.resolvedCount).toBe(2); // 6.mp4 + 2.mp4
    expect(out.executableCount).toBe(2); // disable 6.mp4 + rename 2.mp4 (đều executable)
    expect(out.unresolvedCount).toBe(1); // ghost
  });
});

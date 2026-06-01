/**
 * SAFE-1a — Plan resolver + preview (Tầng an toàn, CHỈ ĐỌC).
 *
 * Kế hoạch edit (AI-3) tham chiếu clip theo `media_path` (đường dẫn file).
 * Timeline thật tham chiếu clip theo `clipId`. Module này là CẦU: khớp
 * media_path → clip thật trên timeline, rồi sinh PREVIEW người-đọc-được
 * cho từng bước — KHÔNG ghi gì.
 *
 * Đây là nửa "Xem trước" của Tầng an toàn: bạn thấy chính xác từng bước sẽ
 * làm gì (clip nào, thao tác gì, đổi ra sao) TRƯỚC khi duyệt cho ghi.
 *
 * Hàm `resolvePlan` thuần (không phụ thuộc adapter) để dễ test: caller chỉ
 * cần truyền `clips` lấy từ `adapter.listClips`.
 */

import type { Clip } from '@directorai/core';
import type { EditPlan, EditPlanStep, SafePlanAction } from './director-tools.js';

/** Action nào có method adapter thực sự ghi được (Track A). `rename` CHƯA
 *  có trên INLEAdapter → preview-only cho tới khi bổ sung renameClip. */
export const EXECUTABLE_ACTIONS: Record<SafePlanAction, boolean> = {
  disable: true,
  trim: true,
  move: true,
  transition: true,
  rename: false,
};

export interface ResolvedStep {
  order: number;
  action: SafePlanAction;
  targetPath: string;
  clipId: string | null;
  clipName: string | null;
  resolved: boolean;
  executable: boolean;
  description: string;
  warning?: string;
  params: Record<string, unknown>;
  reason: string;
}

export interface PlanPreview {
  sequenceId: string;
  totalSteps: number;
  resolvedCount: number;
  executableCount: number;
  unresolvedCount: number;
  steps: ResolvedStep[];
  unresolvedPaths: string[];
  /** Tầng an toàn LUÔN cần bạn duyệt trước khi ghi. */
  requiresApproval: true;
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

function basename(p: string): string {
  return normPath(p).split('/').pop() ?? normPath(p);
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function describe(
  step: EditPlanStep,
  clip: Clip | null
): { description: string; warning?: string } {
  const name = clip?.name ?? basename(step.target_path);
  const p = step.params ?? {};
  switch (step.action) {
    case 'disable':
      return { description: `Tắt clip "${name}" khỏi bản dựng (ẩn, KHÔNG xoá file)` };
    case 'trim': {
      const a = num(p.in_sec);
      const b = num(p.out_sec);
      const range = a !== null && b !== null ? `còn ${a}–${b}s` : '(thiếu in/out)';
      return { description: `Tỉa clip "${name}" ${range}` };
    }
    case 'move': {
      const to = num(p.to_index);
      return { description: `Chuyển clip "${name}" tới vị trí ${to ?? '?'}` };
    }
    case 'transition': {
      const kind = typeof p.kind === 'string' ? p.kind : 'mặc định';
      const dur = num(p.duration_sec);
      return {
        description: `Thêm chuyển cảnh ${kind}${dur !== null ? ` (${dur}s)` : ''} tại clip "${name}"`,
      };
    }
    case 'rename': {
      const nn = typeof p.new_name === 'string' ? p.new_name : '?';
      return {
        description: `Đổi tên "${name}" → "${nn}"`,
        warning: 'rename chưa ghi được trên Premiere 26 qua adapter (preview-only)',
      };
    }
    default:
      return { description: `Thao tác "${step.action}" trên "${name}"` };
  }
}

/**
 * Khớp kế hoạch với timeline thật → preview. Thuần, không ghi.
 *
 * Khớp clip: ưu tiên full-path, fallback basename. Nếu basename trùng nhiều
 * clip (1 file dùng nhiều lần) → vẫn resolve clip đầu + cảnh báo.
 */
export function resolvePlan(
  plan: EditPlan,
  clips: readonly Clip[],
  sequenceId: string
): PlanPreview {
  const byFull = new Map<string, Clip>();
  const byBase = new Map<string, Clip[]>();
  for (const c of clips) {
    const src = c.source?.path ?? '';
    if (src) byFull.set(normPath(src), c);
    const b = basename(src || c.name);
    const arr = byBase.get(b) ?? [];
    arr.push(c);
    byBase.set(b, arr);
  }

  const steps: ResolvedStep[] = [];
  const unresolvedPaths: string[] = [];

  for (const s of plan.steps ?? []) {
    const target = s.target_path ?? '';
    let clip = byFull.get(normPath(target)) ?? null;
    let warning: string | undefined;

    if (!clip) {
      const matches = byBase.get(basename(target));
      if (matches && matches.length > 0) {
        clip = matches[0] ?? null;
        if (matches.length > 1) {
          warning = `khớp ${matches.length} clip cùng tên — preview dùng clip đầu`;
        }
      }
    }

    const resolved = clip !== null;
    if (!resolved) unresolvedPaths.push(target);

    const d = describe(s, clip);
    const executable = resolved && EXECUTABLE_ACTIONS[s.action] === true;
    const combinedWarning = [warning, d.warning].filter(Boolean).join('; ') || undefined;

    steps.push({
      order: s.order,
      action: s.action,
      targetPath: target,
      clipId: clip?.id ?? null,
      clipName: clip?.name ?? null,
      resolved,
      executable,
      description: resolved
        ? d.description
        : `${d.description} — ⚠ KHÔNG tìm thấy clip "${basename(target)}" trên timeline`,
      warning: combinedWarning,
      params: s.params ?? {},
      reason: s.reason ?? '',
    });
  }

  const resolvedCount = steps.filter((s) => s.resolved).length;
  const executableCount = steps.filter((s) => s.executable).length;

  return {
    sequenceId,
    totalSteps: steps.length,
    resolvedCount,
    executableCount,
    unresolvedCount: steps.length - resolvedCount,
    steps,
    unresolvedPaths,
    requiresApproval: true,
  };
}

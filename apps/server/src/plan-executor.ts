/**
 * SAFE-1c — Apply executor (Tầng an toàn, GHI THẬT có kiểm soát).
 *
 * Nửa "Thực thi" của Tầng an toàn. Nhận preview ĐÃ resolve (SAFE-1a) +
 * cờ duyệt, rồi ghi từng bước qua adapter (Track A — executeTransaction).
 *
 * Nguyên tắc an toàn:
 * - Bản đầu CHỈ thực thi thao tác có map SẠCH + reversible: `disable`,
 *   `rename`. Đây là 2 thao tác giá trị cao nhất (lọc clip kém + đặt tên
 *   theo cảnh) và 100% hoàn tác được.
 * - `trim` / `move` / `transition` bị DEFER (báo rõ lý do) vì cần xử lý
 *   ngữ nghĩa riêng (in/out vs vị-trí-timeline; index→giây; clip kề) —
 *   làm chuẩn ở bước sau, KHÔNG đoán mò để tránh ghi sai.
 * - dryRun: mô phỏng, không ghi gì.
 * - Cổng duyệt: caller phải truyền approved=true mới ghi (xem composite).
 */

import type { INLEAdapter } from '@directorai/premiere-adapter';
import type { Clip, Seconds } from '@directorai/core';
import type { Logger } from '@directorai/shared';
import type { SafePlanAction } from './director-tools.js';
import type { PlanPreview, ResolvedStep } from './plan-resolver.js';

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Tính newStart (giây) cho 1 bước move từ to_index, dựa trên thứ tự clip
 *  hiện tại trên timeline. Clamp an toàn trong [0, cuối timeline]. */
function computeMoveStart(toIndex: number, sortedStarts: number[], sortedEnds: number[]): number {
  if (sortedStarts.length === 0) return 0;
  if (toIndex <= 0) return sortedStarts[0] ?? 0;
  if (toIndex >= sortedStarts.length) return sortedEnds[sortedEnds.length - 1] ?? 0;
  return sortedStarts[toIndex] ?? 0;
}

/** Thao tác có map tham số SẠCH sang adapter ngay bây giờ (an toàn ghi). */
export const EXECUTOR_SUPPORTED: Record<SafePlanAction, boolean> = {
  disable: true,
  rename: true,
  trim: true, // SAFE-1e: setClipInOut — tỉa in/out tại chỗ, không dịch vị trí
  move: true, // SAFE-1e: moveClip(newStart) tính từ to_index
  transition: false, // API transition Premiere 26 CHƯA verify → vẫn defer
};

export type StepStatus = 'applied' | 'failed' | 'skipped' | 'deferred' | 'dry-run';

export interface ApplyStepResult {
  order: number;
  action: SafePlanAction;
  clipId: string | null;
  clipName: string | null;
  status: StepStatus;
  detail: string;
}

export interface ApplyResult {
  sequenceId: string;
  dryRun: boolean;
  total: number;
  applied: number;
  failed: number;
  skipped: number;
  deferred: number;
  dryRunCount: number;
  results: ApplyStepResult[];
}

interface ExecCtx {
  sortedStarts: number[];
  sortedEnds: number[];
}

async function execStep(adapter: INLEAdapter, step: ResolvedStep, ctx: ExecCtx): Promise<string> {
  const clipId = step.clipId as string; // đã đảm bảo resolved trước khi gọi
  const p = step.params ?? {};
  switch (step.action) {
    case 'disable':
      await adapter.setClipDisabled(clipId, true);
      return `đã tắt clip "${step.clipName}"`;
    case 'rename': {
      const newName = String(p.new_name ?? '').trim();
      if (!newName) throw new Error('rename: thiếu new_name');
      await adapter.renameClip(clipId, newName);
      return `đã đổi tên "${step.clipName}" → "${newName}"`;
    }
    case 'trim': {
      const inSec = num(p.in_sec);
      const outSec = num(p.out_sec);
      if (inSec === null || outSec === null) throw new Error('trim: thiếu in_sec/out_sec');
      if (!(outSec > inSec)) throw new Error(`trim: out_sec (${outSec}) phải > in_sec (${inSec})`);
      await adapter.setClipInOut(clipId, inSec as Seconds, outSec as Seconds);
      return `đã tỉa "${step.clipName}" còn ${inSec}–${outSec}s`;
    }
    case 'move': {
      const toIndex = num(p.to_index);
      if (toIndex === null) throw new Error('move: thiếu to_index');
      const newStart = computeMoveStart(Math.round(toIndex), ctx.sortedStarts, ctx.sortedEnds);
      await adapter.moveClip({ clipId, newStart: newStart as Seconds });
      return `đã chuyển "${step.clipName}" tới ~${newStart.toFixed(1)}s (index ${toIndex})`;
    }
    default:
      throw new Error(`execStep: action "${step.action}" chưa hỗ trợ`);
  }
}

/**
 * Thực thi preview đã resolve. KHÔNG tự build/guard — caller (composite)
 * chịu trách nhiệm preview + cổng duyệt trước khi gọi.
 */
export async function applyResolvedPlan(
  adapter: INLEAdapter,
  preview: PlanPreview,
  opts: { dryRun: boolean; logger?: Logger }
): Promise<ApplyResult> {
  const results: ApplyStepResult[] = [];

  // Cho move: cần thứ tự clip hiện tại để map to_index → newStart (giây).
  // Chỉ tải khi sẽ GHI THẬT và có bước move executable.
  let ctx: ExecCtx = { sortedStarts: [], sortedEnds: [] };
  const hasMove = preview.steps.some(
    (s) => s.action === 'move' && s.resolved && EXECUTOR_SUPPORTED.move
  );
  if (!opts.dryRun && hasMove) {
    const clips: readonly Clip[] = await adapter.listClips(preview.sequenceId);
    const sorted = [...clips].sort((a, b) => a.timelineRange.start - b.timelineRange.start);
    ctx = {
      sortedStarts: sorted.map((c) => c.timelineRange.start),
      sortedEnds: sorted.map((c) => c.timelineRange.end),
    };
  }

  for (const step of preview.steps) {
    const base = {
      order: step.order,
      action: step.action,
      clipId: step.clipId,
      clipName: step.clipName,
    };

    // 1) Không khớp clip → bỏ qua.
    if (!step.resolved || !step.clipId) {
      results.push({
        ...base,
        status: 'skipped',
        detail: `bỏ qua: không khớp clip "${step.targetPath}"`,
      });
      continue;
    }
    // 2) Action chưa map sạch để ghi → defer (an toàn).
    if (!EXECUTOR_SUPPORTED[step.action]) {
      results.push({
        ...base,
        status: 'deferred',
        detail: `hoãn: thao tác "${step.action}" cần xử lý ngữ nghĩa riêng (bản sau)`,
      });
      continue;
    }
    // 3) Dry-run → mô phỏng.
    if (opts.dryRun) {
      results.push({ ...base, status: 'dry-run', detail: `(dry-run) sẽ: ${step.description}` });
      continue;
    }
    // 4) Ghi thật.
    try {
      const detail = await execStep(adapter, step, ctx);
      results.push({ ...base, status: 'applied', detail });
      opts.logger?.info(
        { order: step.order, action: step.action, clipId: step.clipId },
        'safe.apply step applied'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ ...base, status: 'failed', detail: `lỗi: ${msg}` });
      opts.logger?.warn(
        { order: step.order, action: step.action, error: msg },
        'safe.apply step failed'
      );
    }
  }

  const count = (s: StepStatus): number => results.filter((r) => r.status === s).length;
  return {
    sequenceId: preview.sequenceId,
    dryRun: opts.dryRun,
    total: results.length,
    applied: count('applied'),
    failed: count('failed'),
    skipped: count('skipped'),
    deferred: count('deferred'),
    dryRunCount: count('dry-run'),
    results,
  };
}

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
import type { Logger } from '@directorai/shared';
import type { SafePlanAction } from './director-tools.js';
import type { PlanPreview, ResolvedStep } from './plan-resolver.js';

/** Thao tác có map tham số SẠCH sang adapter ngay bây giờ (an toàn ghi). */
export const EXECUTOR_SUPPORTED: Record<SafePlanAction, boolean> = {
  disable: true,
  rename: true,
  trim: false, // newRange = vị-trí-timeline, KHÁC in/out nội dung của plan
  move: false, // plan dùng to_index, adapter cần newStart (giây)
  transition: false, // cần clip kề (clipIdA+clipIdB), plan chỉ có 1 target
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

async function execStep(adapter: INLEAdapter, step: ResolvedStep): Promise<string> {
  const clipId = step.clipId as string; // đã đảm bảo resolved trước khi gọi
  switch (step.action) {
    case 'disable':
      await adapter.setClipDisabled(clipId, true);
      return `đã tắt clip "${step.clipName}"`;
    case 'rename': {
      const newName = String(step.params?.new_name ?? '').trim();
      if (!newName) throw new Error('rename: thiếu new_name');
      await adapter.renameClip(clipId, newName);
      return `đã đổi tên "${step.clipName}" → "${newName}"`;
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
      const detail = await execStep(adapter, step);
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

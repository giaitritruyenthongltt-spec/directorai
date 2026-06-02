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
import { EXECUTABLE_ACTIONS, type PlanPreview, type ResolvedStep } from './plan-resolver.js';
import { computeReorderOps, type MoveIntent } from './reorder.js';

/**
 * Action executor thực sự ghi được = NGUỒN SỰ THẬT chung với resolver
 * (EXECUTABLE_ACTIONS). Trùng khớp 100% nên preview không bao giờ hứa sai.
 */
export const EXECUTOR_SUPPORTED = EXECUTABLE_ACTIONS;

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

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

/** Thực thi 1 bước KHÔNG-move (disable/rename/trim). move xử lý theo BATCH. */
async function execStep(adapter: INLEAdapter, step: ResolvedStep): Promise<string> {
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
    case 'transition': {
      const kind = String(p.kind ?? 'dissolve').trim();
      const durationSec = num(p.duration_sec) ?? 0.5;
      // "Cut" = cắt thẳng → không cần component transition.
      if (/^(cut|hard ?cut)$/i.test(kind)) {
        return `cắt thẳng "${step.clipName}" (không thêm chuyển cảnh)`;
      }
      // Áp ở đầu clip mục tiêu (giữa clip trước và clip này). clipIdA=clipIdB
      // vì đường Action-model chỉ dùng clip mục tiêu + applyToStart.
      await adapter.applyTransition({
        clipIdA: clipId,
        clipIdB: clipId,
        matchName: kind,
        durationSec: durationSec as Seconds,
      });
      return `đã thêm chuyển cảnh ${kind} (${durationSec}s) tại "${step.clipName}"`;
    }
    default:
      throw new Error(`execStep: action "${step.action}" không xử lý ở đây`);
  }
}

/**
 * C1 — Thực thi TẤT CẢ bước move như 1 mẻ re-pack ripple-aware (không chồng
 * lấn). Trả Map theo order-bước → kết quả. CHỈ re-pack clip VIDEO trên cùng
 * track của clip move đầu tiên.
 */
async function execMoveBatch(
  adapter: INLEAdapter,
  sequenceId: string,
  moveSteps: ResolvedStep[],
  logger?: Logger
): Promise<Map<number, { ok: boolean; detail: string }>> {
  const out = new Map<number, { ok: boolean; detail: string }>();
  try {
    const clips: readonly Clip[] = await adapter.listClips(sequenceId);
    // Track của clip move đầu tiên (chỉ re-pack track đó, clip video).
    const firstClip = clips.find((c) => c.id === moveSteps[0]?.clipId);
    const trackId = firstClip?.trackId;
    const videoClips = clips.filter((c) => c.kind === 'video' && c.trackId === trackId);
    const intents: MoveIntent[] = moveSteps.map((s) => ({
      clipId: s.clipId as string,
      toIndex: num(s.params?.to_index) ?? 0,
    }));
    const ops = computeReorderOps(videoClips, intents);
    for (const op of ops) {
      await adapter.moveClip({ clipId: op.clipId, newStart: op.newStart as Seconds });
    }
    logger?.info({ sequenceId, ops: ops.length, moves: moveSteps.length }, 'safe.apply move batch');
    for (const s of moveSteps) {
      out.set(s.order, { ok: true, detail: `đã sắp lại (re-pack ${ops.length} thao tác an toàn)` });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger?.warn({ sequenceId, error: msg }, 'safe.apply move batch failed');
    for (const s of moveSteps) out.set(s.order, { ok: false, detail: `lỗi sắp lại: ${msg}` });
  }
  return out;
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

  // C1 — Gom bước move (resolved, executable) → thực thi 1 mẻ ripple-aware.
  const moveSteps = preview.steps.filter(
    (s) => s.action === 'move' && s.resolved && !!s.clipId && EXECUTOR_SUPPORTED.move
  );
  let moveOutcome: Map<number, { ok: boolean; detail: string }> | null = null;
  if (!opts.dryRun && moveSteps.length > 0) {
    moveOutcome = await execMoveBatch(adapter, preview.sequenceId, moveSteps, opts.logger);
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
    // 4a) move → đọc kết quả từ mẻ batch (C1).
    if (step.action === 'move') {
      const o = moveOutcome?.get(step.order);
      results.push({
        ...base,
        status: o?.ok ? 'applied' : 'failed',
        detail: o?.detail ?? 'move: không có kết quả batch',
      });
      continue;
    }
    // 4b) Ghi thật (disable/rename/trim).
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

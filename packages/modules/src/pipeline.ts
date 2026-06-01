/**
 * MOD-1 — Pipeline runner (khung). Chạy 1 module qua 3 pha signals→judge→
 * execute, mỗi pha tuỳ chọn. Bản B2 là khung; module thật cài hành vi ở B4.
 */

import type { EditModuleDef, ModuleContext, ModuleStep } from './types.js';

export interface ModuleRunResult {
  moduleId: string;
  steps: ModuleStep[];
  notes?: string;
  /** pha chạy được tới đâu (để debug). */
  ran: { signals: boolean; judge: boolean; execute: boolean };
}

/**
 * Chạy 1 module. Nếu module chưa cài đủ signals/judge/execute thì trả về
 * kết quả rỗng (không lỗi) — cho phép module "metadata-only" tồn tại trong
 * lúc hành vi đang được cài dần.
 */
export async function runModule(mod: EditModuleDef, ctx: ModuleContext): Promise<ModuleRunResult> {
  const ran = { signals: false, judge: false, execute: false };
  if (!mod.signals || !mod.judge || !mod.execute) {
    return { moduleId: mod.id, steps: [], ran };
  }
  const signals = await mod.signals(ctx);
  ran.signals = true;
  const decision = await mod.judge(ctx, signals);
  ran.judge = true;
  const steps = mod.execute(ctx, decision);
  ran.execute = true;
  return { moduleId: mod.id, steps, notes: decision.notes, ran };
}

/** Chạy nhiều module, gộp steps (đánh số order lại liên tục). */
export async function runModules(
  mods: readonly EditModuleDef[],
  ctx: ModuleContext
): Promise<{ steps: ModuleStep[]; results: ModuleRunResult[] }> {
  const results: ModuleRunResult[] = [];
  const steps: ModuleStep[] = [];
  for (const mod of mods) {
    const r = await runModule(mod, ctx);
    results.push(r);
    for (const s of r.steps) steps.push({ ...s, order: steps.length + 1 });
  }
  return { steps, results };
}

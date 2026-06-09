/**
 * MOD-1 — Kiểu cho khung module (signals → judge → execute).
 *
 * Mỗi module là một "năng lực edit" có 3 phần (xem MASTER-ROADMAP §3):
 *  - signals: tín hiệu CV thô (rẻ) — gợi ý ứng viên.
 *  - judge:   Vision/LLM HIỂU + quyết định giữ/bỏ (đắt, chỉ chạy subset).
 *  - execute: sinh bước thực thi AN TOÀN (chỉ thao tác đã verify ghi).
 *
 * Bản B2 định nghĩa khung + metadata (registry). signals/judge/execute là
 * tuỳ chọn — sẽ cài đặt dần (B4). Phần metadata + goalHint đủ để AutoTab
 * render động + server expose module.list ngay.
 */

/** Mức khả thi ghi của module trên Premiere 26. */
export type ModuleFeasibility =
  | 'verified' // đã verify ghi được (disable/trim/move/rename)
  | 'beta' // code xong, chưa verify live (vd màu Lumetri)
  | 'fcpxml' // chỉ làm được qua FCPXML (split/speed/insert)
  | 'analysis'; // chỉ đọc/báo cáo, không ghi

export type ModuleCategory =
  | 'cleanup'
  | 'trim'
  | 'order'
  | 'rename'
  | 'transition'
  | 'color'
  | 'speed'
  | 'analysis';

/** Thao tác an toàn (khớp SAFE_PLAN_ACTIONS phía server). */
export type SafeAction = 'disable' | 'trim' | 'move' | 'rename' | 'transition';

export interface ModuleHelp {
  title: string;
  lines: readonly string[];
  example?: string;
}

/** Bước thực thi do execute() sinh ra (khớp EditPlanStep phía server). */
export interface ModuleStep {
  order: number;
  action: SafeAction;
  target_path: string;
  params: Record<string, unknown>;
  reason: string;
  reversible: boolean;
}

/** Ngữ cảnh chạy module (clip + mục tiêu). */
export interface ModuleContext {
  clipPaths: readonly string[];
  goal?: string;
}

/** Tín hiệu CV thô cho 1 clip (rẻ, chạy hết). */
export interface ClipSignal {
  clipPath: string;
  /** điểm "nghi ngờ kém" 0..1 (cao = nên xem kỹ). */
  suspectScore: number;
  reason: string;
}

export interface ModuleSignals {
  candidates: readonly ClipSignal[];
}

export interface ModuleDecision {
  steps: readonly ModuleStep[];
  /** ghi chú vì sao quyết định (cho minh bạch). */
  notes?: string;
}

/**
 * Định nghĩa 1 module. Phần metadata bắt buộc; signals/judge/execute tuỳ
 * chọn (cài dần). Thêm 1 module = +1 object trong registry.
 */
export interface EditModuleDef {
  id: string;
  category: ModuleCategory;
  /** Tên tiếng Việt hiển thị trên UI. */
  name: string;
  icon: string;
  feasibility: ModuleFeasibility;
  /** Câu gợi ý mục tiêu (ghép vào goal khi module được tích). */
  goalHint: string;
  help: ModuleHelp;
  /** Mặc định tích sẵn trong AutoTab. */
  defaultEnabled?: boolean;
  /** Bật được trên UI không (false = "sắp có"). */
  enabled: boolean;

  // ── Tuỳ chọn — hành vi (cài dần B4) ──
  signals?: (ctx: ModuleContext) => Promise<ModuleSignals>;
  judge?: (ctx: ModuleContext, signals: ModuleSignals) => Promise<ModuleDecision>;
  execute?: (ctx: ModuleContext, decision: ModuleDecision) => ModuleStep[];
}

/** Bản rút gọn để gửi qua WS (không kèm hàm). */
export interface EditModuleInfo {
  id: string;
  category: ModuleCategory;
  name: string;
  icon: string;
  feasibility: ModuleFeasibility;
  goalHint: string;
  help: ModuleHelp;
  defaultEnabled: boolean;
  enabled: boolean;
}

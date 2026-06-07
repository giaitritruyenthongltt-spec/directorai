/**
 * log-store — bộ đệm nhật ký vận hành cho box debug TRONG panel.
 *
 * LÝ DO: UXP không có DevTools tiện như web; xem lỗi phải mở UDT. Box log
 * ngay trong panel giúp người dùng (và hỗ trợ) thấy lỗi/sự kiện tức thì,
 * sao chép gửi đi để check bug.
 *
 * Thiết kế GỌN: ring buffer (giữ MAX mục mới nhất) + patch console.error/warn
 * + bắt window error. Các nơi khác (WS, RPC) gọi pushLog() để thêm.
 */

export type LogLevel = 'info' | 'warn' | 'error';
export interface LogItem {
  id: number;
  ts: number;
  level: LogLevel;
  src: string;
  msg: string;
  /** P4 — nội dung đầy đủ (params/result/stack) để bung xem chi tiết. */
  detail?: string;
}

const MAX = 300;
let items: LogItem[] = [];
let seq = 0;
const subs = new Set<() => void>();

/** P3 — sink đẩy log (warn/error) ra ngoài (server ops.log) để BỀN sau crash. */
type LogSink = (it: { level: LogLevel; src: string; msg: string }) => void;
let sink: LogSink | null = null;
export function setLogSink(fn: LogSink | null): void {
  sink = fn;
}

function emit(): void {
  subs.forEach((f) => f());
}

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  } catch {
    return String(v);
  }
}

/** Thêm 1 dòng log (mới nhất ở đầu mảng). `detail` = nội dung đầy đủ để bung. */
export function pushLog(level: LogLevel, src: string, msg: unknown, detail?: unknown): void {
  const full = safeStr(msg);
  const text = full.slice(0, 300);
  const det =
    detail !== undefined
      ? safeStr(detail).slice(0, 8000)
      : full.length > 300
        ? full.slice(0, 8000)
        : undefined;
  items = [{ id: ++seq, ts: Date.now(), level, src, msg: text, detail: det }, ...items].slice(
    0,
    MAX
  );
  emit();
  // P3 — chỉ đẩy warn/error ra server (info quá nhiều, giữ nhẹ).
  if (sink && level !== 'info') {
    try {
      sink({ level, src, msg: det ?? text });
    } catch {
      // không để sink làm sập
    }
  }
}

export function getLogs(): LogItem[] {
  return items;
}

export function clearLogs(): void {
  items = [];
  emit();
}

export function subscribeLogs(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function errorCount(): number {
  return items.reduce((n, i) => n + (i.level === 'error' ? 1 : 0), 0);
}

let captured = false;
/** Bắt console.error/warn + lỗi cửa sổ → đẩy vào store. Gọi 1 lần lúc mount. */
export function initLogCapture(): void {
  if (captured) return;
  captured = true;
  const wrap =
    (level: LogLevel, orig: (...a: unknown[]) => void) =>
    (...args: unknown[]): void => {
      try {
        pushLog(level, 'panel', args.map((a) => safeStr(a)).join(' '));
      } catch {
        // không để log làm sập app
      }
      orig(...args);
    };
  try {
    console.error = wrap('error', console.error.bind(console));
    console.warn = wrap('warn', console.warn.bind(console));
  } catch {
    // bỏ qua nếu không patch được
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => {
      pushLog('error', 'panel', `${e.message} @ ${e.filename || '?'}:${e.lineno || 0}`);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = (e as PromiseRejectionEvent).reason;
      pushLog(
        'error',
        'panel',
        `unhandledrejection: ${r instanceof Error ? r.message : safeStr(r)}`
      );
    });
  }
}

/**
 * UI3 — Hook chuẩn hóa pattern bất đồng bộ (busy/error/result).
 *
 * 4 tab hiện lặp y hệt: useState busy/error/result + try/catch/finally. Hook
 * này gom lại 1 nơi → giảm state rải rác, tránh quên reset error.
 */

import { useCallback, useRef, useState } from 'react';

export interface AsyncState<T> {
  /** Kết quả lần chạy gần nhất (null nếu chưa chạy/đang chạy lỗi). */
  data: T | null;
  /** Đang chạy. */
  busy: boolean;
  /** Thông báo lỗi (đã chuẩn hóa về string) hoặc null. */
  error: string | null;
  /** Chạy tác vụ; tự set busy/error/data. Trả kết quả (hoặc ném lại lỗi). */
  run: (...args: unknown[]) => Promise<T | undefined>;
  /** Xóa lỗi + kết quả. */
  reset: () => void;
  /** Đặt kết quả thủ công (vd điền từ nguồn khác). */
  setData: (d: T | null) => void;
}

export function useAsync<T>(fn: (...args: never[]) => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Giữ fn mới nhất mà không buộc người gọi memo hóa.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: unknown[]): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const result = await fnRef.current(...(args as never[]));
      setData(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setData(null);
  }, []);

  return { data, busy, error, run, reset, setData };
}

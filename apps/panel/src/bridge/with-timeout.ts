/**
 * Bọc timeout cho tác vụ DÀI (Gemini per-clip). Panel `wsClient.call()` KHÔNG có
 * timeout → sidecar kẹt = UI treo vô hạn. Race với timeout để mở khoá UI (server
 * vẫn chạy nền; chỉ giải phóng UI + báo rõ để người dùng thử lại / lọc bớt clip).
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} quá lâu (>${Math.round(ms / 1000)}s) — sidecar có thể đang kẹt. ` +
                'Thử lại, hoặc lọc bớt clip cho nhẹ.'
            )
          ),
        ms
      )
    ),
  ]);
}

/** Trần timeout cho pipeline Gemini per-clip: nền + hệ số theo số clip, cap 15 phút. */
export function planTimeoutMs(clipCount: number, baseMs = 120_000, perClipMs = 4000): number {
  return Math.min(15 * 60_000, baseMs + clipCount * perClipMs);
}

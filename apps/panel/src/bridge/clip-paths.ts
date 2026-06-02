/**
 * C8 — Tiện ích chung: tách textarea "mỗi dòng/`;` 1 đường dẫn" → mảng path.
 * Trước đây AutoTab + AnalysisTab lặp lại logic này (audit gap #10).
 */
export function parseClipPaths(text: string): string[] {
  return text
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lấy tên file từ đường dẫn (cuối cùng sau / hoặc \). */
export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

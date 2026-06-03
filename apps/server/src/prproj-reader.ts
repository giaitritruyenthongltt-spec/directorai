/**
 * PATH-FIX phương án 2 — Đọc thẳng file `.prproj` để lấy đường dẫn media
 * TUYỆT ĐỐI cho MỌI clip (authoritative bulk).
 *
 * `.prproj` = XML nén gzip (từ CS6). Bên trong, mỗi `<Media>` có
 * `<ActualMediaFilePath>` / `<FilePath>` = đường dẫn OS thuần (KHÔNG url-encode).
 * Đây là nguồn ĐÚNG NHẤT: chính path Premiere đang dùng, kể cả clip đổi tên.
 * Điều kiện: project đã LƯU (đọc file trên đĩa).
 */

import { gunzipSync } from 'node:zlib';
import { promises as fs } from 'node:fs';

export interface PrprojMedia {
  /** basename (tên file kèm đuôi). */
  name: string;
  /** đường dẫn tuyệt đối. */
  fullPath: string;
}

/** Giải mã các entity XML cơ bản trong text node path. */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)));
}

/**
 * Trích mọi đường dẫn media từ XML .prproj. Ưu tiên ActualMediaFilePath, bù
 * thêm FilePath. Bỏ giá trị số (synthetic clip: Black Video, Bars & Tone…).
 */
export function extractMediaPaths(xml: string): PrprojMedia[] {
  const out: PrprojMedia[] = [];
  const seen = new Set<string>();
  const re = /<(ActualMediaFilePath|FilePath)>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = decodeXmlEntities((m[2] ?? '').trim());
    // Chỉ nhận path thật (có dấu phân cách); loại số/synthetic/rỗng.
    if (!raw || !(raw.includes('/') || raw.includes('\\'))) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    const base = raw.split(/[\\/]/).pop() ?? raw;
    out.push({ name: base, fullPath: raw });
  }
  return out;
}

/** Đọc + giải nén + trích đường dẫn media từ 1 file .prproj trên đĩa. */
export async function readPrprojMedia(prprojPath: string): Promise<PrprojMedia[]> {
  const buf = await fs.readFile(prprojPath);
  // gzip magic = 0x1f 0x8b. Nếu không nén thì là XML thuần (hiếm).
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const xml = (isGzip ? gunzipSync(buf) : buf).toString('utf8');
  return extractMediaPaths(xml);
}

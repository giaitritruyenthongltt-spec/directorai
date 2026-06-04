/**
 * Icon — hệ icon SVG cho UXP (Premiere).
 *
 * BUG GỐC (đã thử 2 cách thất bại): UXP KHÔNG render `<svg>` nội tuyến (DOM tùy
 * biến) → ô vuông đen; UXP cũng KHÔNG hỗ trợ `-webkit-mask-image` → ô vuông đặc.
 *
 * CÁCH CHẠY ĐƯỢC: render SVG qua thẻ <img> (data URI). UXP hỗ trợ SVG dạng ẢNH.
 * Hệ quả: màu phải "nướng" sẵn vào SVG (img không ăn currentColor của trang) →
 * dùng bộ icon ĐƠN SẮC (giống Adobe Spectrum). Mặc định màu theo chữ; có prop
 * `color` để đổi (vd accent). Đổi màu theo trạng thái active dùng nhãn/underline
 * (đã có) thay vì màu icon.
 */

import React from 'react';

export type IconName =
  | 'film'
  | 'zap'
  | 'report'
  | 'clapperboard'
  | 'chat'
  | 'sliders'
  | 'search'
  | 'folder'
  | 'scan'
  | 'sparkles'
  | 'eye'
  | 'check'
  | 'play'
  | 'refresh'
  | 'alert'
  | 'x'
  | 'target'
  | 'mic'
  | 'scissors'
  | 'music'
  | 'image'
  | 'send'
  | 'chevronDown'
  | 'chevronRight'
  | 'wand'
  | 'list'
  | 'clock'
  | 'help'
  | 'palette'
  | 'layers'
  | 'trash'
  | 'info'
  | 'pause'
  | 'stop';

/** Markup bên trong <svg> (viewBox 0 0 24 24). Nét đặc dùng fill="#fff" (token
 * sẽ thay bằng màu thực khi dựng data URI). */
const SHAPES: Record<IconName, string> = {
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  report: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  clapperboard:
    '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9M12.4 3.4l3.1 4M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  sliders:
    '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  sparkles:
    '<path d="M9.94 14.06A2 2 0 0 0 8.5 12.6l-5.4-1.4a.5.5 0 0 1 0-.96l5.4-1.4A2 2 0 0 0 9.94 7.4l1.4-5.4a.5.5 0 0 1 .96 0l1.4 5.4a2 2 0 0 0 1.44 1.44l5.4 1.4a.5.5 0 0 1 0 .96l-5.4 1.4a2 2 0 0 0-1.44 1.44l-1.4 5.4a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="M21.8 10A10 10 0 1 1 17 3.34"/><path d="m9 11 3 3L22 4"/>',
  play: '<path d="M6 3v18l15-9z" fill="#fff" stroke="none"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  alert:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  target:
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  scissors:
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  send: '<path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.1 1.11z"/><path d="m21.85 2.15-10.94 10.94"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  wand: '<path d="m15 4 1 1M9.5 7.5 4 13l-2 7 7-2 5.5-5.5"/><path d="m18 11 2-2M19 3v4M21 5h-4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  palette:
    '<circle cx="13.5" cy="6.5" r="1" fill="#fff" stroke="none"/><circle cx="17.5" cy="10.5" r="1" fill="#fff" stroke="none"/><circle cx="8.5" cy="7.5" r="1" fill="#fff" stroke="none"/><circle cx="6.5" cy="12.5" r="1" fill="#fff" stroke="none"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
  layers:
    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  trash:
    '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  pause:
    '<rect x="14" y="4" width="4" height="16" rx="1" fill="#fff" stroke="none"/><rect x="6" y="4" width="4" height="16" rx="1" fill="#fff" stroke="none"/>',
  stop: '<circle cx="12" cy="12" r="10"/><rect width="6" height="6" x="9" y="9" rx="1" fill="#fff" stroke="none"/>',
};

/** Màu icon mặc định (đơn sắc, đọc tốt trên nền tối Premiere). */
const DEFAULT_COLOR = '#cfd3da';

const URI_CACHE = new Map<string, string>();

function svgUri(name: IconName, strokeWidth: number, color: string): string {
  const key = `${name}:${strokeWidth}:${color}`;
  const cached = URI_CACHE.get(key);
  if (cached) return cached;
  // "Nướng" màu vào SVG: nét (#fff filled) + stroke = color.
  const shape = SHAPES[name].replace(/#fff/g, color);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" ` +
    `stroke-linejoin="round">${shape}</svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  URI_CACHE.set(key, uri);
  return uri;
}

export interface IconProps {
  name: IconName;
  /** px — mặc định 16 (ăn theo font-size dòng). */
  size?: number;
  className?: string;
  /** nét đậm — mặc định 2. */
  strokeWidth?: number;
  /** màu icon (literal CSS color) — mặc định đơn sắc sáng. */
  color?: string;
}

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 2,
  color = DEFAULT_COLOR,
}: IconProps): React.ReactElement {
  return (
    <img
      className={`icon${className ? ` ${className}` : ''}`}
      src={svgUri(name, strokeWidth, color)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

/**
 * P1 — Color "looks" tiếng Việt + scaling theo cường độ.
 *
 * Lớp trình bày cho người dùng: gắn nhãn tiếng Việt + mô tả + emoji cho 12
 * recipe Lumetri có sẵn (lumetri-presets.ts) để hiện trong gallery "⚙️ chọn
 * mẫu". `scaleRecipe` nhân cường độ (0..100%) quanh GIÁ TRỊ GỐC của từng
 * tham số (saturation gốc=100, các tham số khác gốc=0) rồi clamp theo range.
 */

import {
  LUMETRI_PARAM_RANGES,
  LUMETRI_RECIPES,
  getLumetriRecipe,
  type LumetriRecipe,
} from './lumetri-presets.js';

export interface ColorLook {
  /** Khớp key trong LUMETRI_RECIPES. */
  id: string;
  /** Nhãn tiếng Việt hiển thị trên nút. */
  label: string;
  /** Mô tả ngắn (tooltip). */
  desc: string;
  emoji: string;
  /** Nổi bật trong gallery rút gọn. */
  featured?: boolean;
}

/** Gallery look — nhãn tiếng Việt cho 12 recipe. Thứ tự = thứ tự hiển thị. */
export const COLOR_LOOKS: readonly ColorLook[] = [
  {
    id: 'pastel_dream',
    label: 'Trong sáng',
    desc: 'Sáng nhẹ, dịu, nâng tối — trong trẻo',
    emoji: '🌤️',
    featured: true,
  },
  {
    id: 'teal_orange',
    label: 'Điện ảnh',
    desc: 'Teal-cam tách tông kiểu phim rạp',
    emoji: '🎬',
    featured: true,
  },
  {
    id: 'warm_vlog',
    label: 'Ấm áp',
    desc: 'Tông ấm, nâng tối — kiểu vlog',
    emoji: '🔥',
    featured: true,
  },
  {
    id: 'cold_drama',
    label: 'Lạnh / Kịch tính',
    desc: 'Tối lạnh, tương phản — drama',
    emoji: '❄️',
    featured: true,
  },
  {
    id: 'punchy_vibrant',
    label: 'Rực rỡ',
    desc: 'Bão hoà + tương phản mạnh — mạng xã hội',
    emoji: '⚡',
    featured: true,
  },
  { id: 'sunset_glow', label: 'Hoàng hôn', desc: 'Ấm vàng cam, midtone ấm', emoji: '🌅' },
  {
    id: 'vintage_kodak',
    label: 'Phim cũ',
    desc: 'Giả film Kodak, nâng đen, ngả vàng',
    emoji: '📽️',
  },
  { id: 'desaturated_film', label: 'Phim trầm', desc: 'Giảm bão hoà, indie film', emoji: '🎞️' },
  {
    id: 'noir_high_contrast',
    label: 'Tương phản cao',
    desc: 'Crush đen, ít màu, kịch tính',
    emoji: '🌑',
  },
  {
    id: 'tech_blue',
    label: 'Xanh công nghệ',
    desc: 'Ngả xanh lạnh kiểu sci-fi/screencap',
    emoji: '🔵',
  },
  { id: 'matrix_green', label: 'Xanh Matrix', desc: 'Ngả xanh lá đậm', emoji: '🟢' },
  {
    id: 'bw_documentary',
    label: 'Đen trắng',
    desc: 'Trắng đen trung tính (bão hoà 0)',
    emoji: '⚫',
  },
];

/** Giá trị "gốc" (identity) của mỗi tham số — scaling xoay quanh giá trị này. */
const IDENTITY: Record<keyof LumetriRecipe, number> = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 100,
  vibrance: 0,
  temperature: 0,
};

function clamp(key: keyof LumetriRecipe, v: number): number {
  const r = LUMETRI_PARAM_RANGES[key];
  return Math.min(r.max, Math.max(r.min, v));
}

/**
 * Nhân cường độ một recipe. intensityPct 0..100 (100 = nguyên bản, 0 = không
 * đổi gì). Mỗi tham số nội suy từ GỐC → giá trị recipe theo tỉ lệ, rồi clamp.
 * Làm tròn 2 chữ số (exposure cần lẻ), tham số khác làm tròn nguyên.
 */
export function scaleRecipe(recipe: LumetriRecipe, intensityPct = 100): LumetriRecipe {
  const t = Math.min(100, Math.max(0, intensityPct)) / 100;
  const out: LumetriRecipe = {};
  for (const k of Object.keys(recipe) as (keyof LumetriRecipe)[]) {
    const target = recipe[k];
    if (target === undefined) continue;
    const base = IDENTITY[k];
    const scaled = base + (target - base) * t;
    const rounded = k === 'exposure' ? Math.round(scaled * 100) / 100 : Math.round(scaled);
    out[k] = clamp(k, rounded);
  }
  return out;
}

/** Lấy recipe đã scale theo look id + cường độ. null nếu look không tồn tại. */
export function getScaledLook(lookId: string, intensityPct = 100): LumetriRecipe | null {
  const base = getLumetriRecipe(lookId);
  return base ? scaleRecipe(base, intensityPct) : null;
}

/** Tra look theo id (cho UI). */
export function getColorLook(lookId: string): ColorLook | undefined {
  return COLOR_LOOKS.find((l) => l.id === lookId);
}

/** Đảm bảo mọi look đều trỏ tới recipe có thật (dùng trong test). */
export function validateLooks(): string[] {
  return COLOR_LOOKS.filter((l) => !(l.id in LUMETRI_RECIPES)).map((l) => l.id);
}

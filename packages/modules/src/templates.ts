/**
 * MOD-7 — Template Nerf 1-click.
 *
 * Mỗi template = bộ module tích sẵn + mục tiêu, để người dùng bấm 1 nút áp
 * cả cấu hình thay vì tick tay. Built-in dưới đây tối ưu cho video Nerf;
 * người dùng có thể lưu thêm template riêng (server template.save).
 */

/** LF7 — Tham số định hướng phim dài đính kèm template (khớp LongformOptions). */
export interface TemplateLongform {
  /** Thời lượng bản dựng mục tiêu (giây). undefined = để người dùng đặt. */
  targetDurationSec?: number;
  /** Tỉ lệ giữ clip 0..1. */
  keepRatio?: number;
  /** Nhịp tổng: slow|balanced|fast|cinematic|build|wind_down. */
  pacingProfile?: string;
  /** Cấu trúc tự sự cho planner. */
  structure?: '3act' | 'chapters' | 'recap';
}

export interface EditTemplate {
  id: string;
  name: string;
  icon: string;
  /** Mô tả ngắn hiển thị tooltip. */
  description: string;
  /** id module tích sẵn. */
  moduleIds: string[];
  /** Mục tiêu thêm (ghép cùng goalHint của module). */
  goal: string;
  /** true = template hệ thống (không xoá được). */
  builtin: boolean;
  /** LF7 — 'short' = clip ngắn/montage; 'long' = phim dài (mặc định 'short'). */
  kind?: 'short' | 'long';
  /** LF7 — định hướng phim dài (chỉ template kind='long'). */
  longform?: TemplateLongform;
}

export const NERF_TEMPLATES: readonly EditTemplate[] = [
  // ─── PHIM DÀI (long-form / điện ảnh) — định hướng chính ───────────────────
  {
    id: 'nerf_film_3act',
    name: 'Phim Nerf 3 hồi',
    icon: '🎞️',
    description:
      'Phim có cốt truyện: thiết lập → đối đầu → giải quyết. Chia chương, giữ ' +
      'khoảnh khắc đắt, ghép cảnh mượt. Cho video dài nhiều phút.',
    moduleIds: ['filter_bad', 'trim', 'reorder', 'rename', 'transition'],
    goal:
      'Dựng một BỘ PHIM NERF có cốt truyện theo cấu trúc 3 hồi (thiết lập nhân ' +
      'vật/bối cảnh → cao trào đối đầu → giải quyết & ăn mừng). Giữ mạch nhân ' +
      'vật, bỏ khoảng chờ/nạp đạn thừa, ghép chương mượt.',
    builtin: true,
    kind: 'long',
    longform: { structure: '3act', pacingProfile: 'cinematic', keepRatio: 0.4 },
  },
  {
    id: 'battle_recap',
    name: 'Recap trận theo hiệp',
    icon: '🏆',
    description:
      'Tóm tắt trận đấu chia theo hiệp/vòng. Mỗi hiệp là 1 chương, giữ pha ' +
      'quyết định (loại/ghi điểm), bỏ đoạn chờ giữa hiệp.',
    moduleIds: ['filter_bad', 'trim', 'reorder', 'rename'],
    goal:
      'Dựng RECAP trận Nerf chia theo HIỆP/VÒNG đấu: mỗi hiệp một chương, giữ ' +
      'pha quyết định và khoảnh khắc lật kèo, bỏ đoạn chờ/di chuyển giữa hiệp.',
    builtin: true,
    kind: 'long',
    longform: { structure: 'recap', pacingProfile: 'balanced', keepRatio: 0.35 },
  },
  {
    id: 'chapters_auto',
    name: 'Chia chương tự nhiên',
    icon: '📖',
    description:
      'Tự chia phim theo mạch sự kiện thành các chương có mở-đỉnh-lắng riêng. ' +
      'Hợp video dài chưa rõ cấu trúc.',
    moduleIds: ['filter_bad', 'trim', 'reorder', 'rename', 'transition'],
    goal:
      'Chia video dài thành các CHƯƠNG tự nhiên theo mạch sự kiện; mỗi chương ' +
      'có mục đích rõ và nhịp riêng. Giữ khoảnh khắc đắt, bỏ phần thừa.',
    builtin: true,
    kind: 'long',
    longform: { structure: 'chapters', pacingProfile: 'balanced', keepRatio: 0.45 },
  },

  // ─── CLIP NGẮN / MONTAGE — giữ cho nhu cầu nhanh ──────────────────────────
  {
    id: 'action_fast',
    name: 'Montage action nhanh',
    icon: '⚡',
    description: 'Lọc clip kém, tỉa thừa, xếp theo cao trào, đặt tên — bản montage ngắn gay cấn.',
    moduleIds: ['filter_bad', 'trim', 'reorder', 'rename'],
    goal: 'Dựng montage action ~45s gay cấn nhất: giữ khoảnh khắc trúng đạn/ngắm bắn, bỏ phần thừa.',
    builtin: true,
    kind: 'short',
    longform: { targetDurationSec: 45, pacingProfile: 'fast' },
  },
  {
    id: 'cleanup_only',
    name: 'Chỉ dọn dẹp',
    icon: '🧹',
    description: 'Ẩn clip hỏng/trùng + đặt tên theo cảnh. Không đụng thứ tự.',
    moduleIds: ['filter_bad', 'rename'],
    goal: 'Dọn dẹp: ẩn clip hỏng/trùng, đặt tên clip theo nội dung cảnh.',
    builtin: true,
    kind: 'short',
  },
  {
    id: 'trim_tight',
    name: 'Tỉa gọn',
    icon: '✂️',
    description: 'Chỉ tỉa phần thừa đầu/cuối từng clip, giữ phần đắt.',
    moduleIds: ['trim'],
    goal: 'Tỉa in/out bỏ đoạn thừa đầu/cuối, giữ trọn pha hành động.',
    builtin: true,
    kind: 'short',
  },
];

export function getTemplate(id: string): EditTemplate | undefined {
  return NERF_TEMPLATES.find((t) => t.id === id);
}

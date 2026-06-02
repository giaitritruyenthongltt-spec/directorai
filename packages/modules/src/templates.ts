/**
 * MOD-7 — Template Nerf 1-click.
 *
 * Mỗi template = bộ module tích sẵn + mục tiêu, để người dùng bấm 1 nút áp
 * cả cấu hình thay vì tick tay. Built-in dưới đây tối ưu cho video Nerf;
 * người dùng có thể lưu thêm template riêng (server template.save).
 */

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
}

export const NERF_TEMPLATES: readonly EditTemplate[] = [
  {
    id: 'action_fast',
    name: 'Bản action nhanh',
    icon: '⚡',
    description: 'Lọc clip kém, tỉa thừa, xếp theo cao trào, đặt tên — bản dựng gay cấn.',
    moduleIds: ['filter_bad', 'trim', 'reorder', 'rename'],
    goal: 'Dựng bản action ~45s gay cấn nhất: giữ khoảnh khắc trúng đạn/ngắm bắn, bỏ phần thừa.',
    builtin: true,
  },
  {
    id: 'cleanup_only',
    name: 'Chỉ dọn dẹp',
    icon: '🧹',
    description: 'Ẩn clip hỏng/trùng + đặt tên theo cảnh. Không đụng thứ tự.',
    moduleIds: ['filter_bad', 'rename'],
    goal: 'Dọn dẹp: ẩn clip hỏng/trùng, đặt tên clip theo nội dung cảnh.',
    builtin: true,
  },
  {
    id: 'story_order',
    name: 'Sắp theo cốt truyện',
    icon: '🎬',
    description: 'Xếp lại thứ tự + đặt tên theo mạch mở đầu → cao trào → kết.',
    moduleIds: ['reorder', 'rename'],
    goal: 'Sắp xếp clip theo cốt truyện: thiết lập → dồn nén → bùng nổ → kết.',
    builtin: true,
  },
  {
    id: 'trim_tight',
    name: 'Tỉa gọn',
    icon: '✂️',
    description: 'Chỉ tỉa phần thừa đầu/cuối từng clip, giữ phần đắt.',
    moduleIds: ['trim'],
    goal: 'Tỉa in/out bỏ đoạn thừa đầu/cuối, giữ trọn pha hành động.',
    builtin: true,
  },
];

export function getTemplate(id: string): EditTemplate | undefined {
  return NERF_TEMPLATES.find((t) => t.id === id);
}

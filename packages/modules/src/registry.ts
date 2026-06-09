/**
 * MOD-1 — Registry module canonical.
 *
 * Nguồn SỰ THẬT duy nhất cho danh sách module. Cả AutoTab (UI) lẫn server
 * (module.list) đọc từ đây. Thêm chức năng = thêm 1 object vào mảng này.
 */

import type { EditModuleDef, EditModuleInfo } from './types.js';

export const MODULE_REGISTRY: readonly EditModuleDef[] = [
  {
    id: 'filter_bad',
    category: 'cleanup',
    name: 'Lọc clip kém / trùng',
    icon: '🚮',
    feasibility: 'verified',
    enabled: true,
    defaultEnabled: true,
    goalHint: 'Ẩn (disable) các clip hỏng, rung lắc, lia trượt hoặc trùng nội dung.',
    help: {
      title: 'Lọc clip kém',
      lines: [
        'AI xem nội dung từng clip, ẨN (không xoá) các clip hỏng thật hoặc trùng.',
        'Mờ do chuyển động nhanh (bắn/né) được GIỮ — chỉ bỏ clip rung/trượt/che ống kính.',
      ],
      example: 'Ẩn clip rung tay không nhìn được gì; giữ clip mờ-do-bắn.',
    },
  },
  {
    id: 'trim',
    category: 'trim',
    name: 'Tỉa phần thừa',
    icon: '✂️',
    feasibility: 'verified',
    enabled: true,
    goalHint: 'Tỉa in/out để bỏ khoảng đầu/cuối thừa, giữ phần action đắt giá.',
    help: {
      title: 'Tỉa phần thừa',
      lines: ['Cắt bớt đoạn đầu/cuối thừa của clip (giữ nguyên vị trí trên timeline).'],
      example: 'Tỉa clip còn đúng pha bắn súng, bỏ 2s đứng yên ở đầu.',
    },
  },
  {
    id: 'reorder',
    category: 'order',
    name: 'Xếp lại theo cốt truyện',
    icon: '🔢',
    feasibility: 'beta',
    enabled: true,
    goalHint: 'Sắp xếp lại thứ tự clip theo cao trào và mạch hành động.',
    help: {
      title: 'Xếp lại thứ tự (beta)',
      lines: [
        'Đổi vị trí clip để mạch phim lên cao trào hợp lý (mở đầu → bùng nổ → kết).',
        'Đang BETA: bước move tạm "hoãn" khi ghi (chờ thuật toán ripple-an-toàn);',
        'bạn vẫn thấy đề xuất trong xem-trước.',
      ],
      example: 'Đưa cảnh thiết lập lên đầu, cú trúng đạn vào cao trào.',
    },
  },
  {
    id: 'rename',
    category: 'rename',
    name: 'Đổi tên theo cảnh',
    icon: '🏷️',
    feasibility: 'verified',
    enabled: true,
    defaultEnabled: true,
    goalHint: 'Đổi tên clip theo nội dung cảnh (vd Hit_Climax, Aim_CloseUp).',
    help: {
      title: 'Đổi tên theo cảnh',
      lines: ['Đặt tên clip theo nội dung để dễ tìm/quản lý khi dựng.'],
      example: '6.mp4 → Hit_Fall; 8.mp4 → Nerf_Fire_CloseUp.',
    },
  },
  {
    id: 'transition',
    category: 'transition',
    name: 'Thêm chuyển cảnh',
    icon: '🎞️',
    feasibility: 'beta',
    enabled: true,
    goalHint: 'Thêm chuyển cảnh mượt (dissolve) giữa các pha hành động.',
    help: {
      title: 'Thêm chuyển cảnh (beta)',
      lines: [
        'Thêm chuyển cảnh (dissolve/wipe/push…) ở đầu clip.',
        'Dùng API Premiere 26 đã introspect thật; verify live còn chờ.',
      ],
      example: 'Additive Dissolve 0.3s giữa 2 cảnh bắn.',
    },
  },
  {
    id: 'color_grade',
    category: 'color',
    name: 'Sửa màu từng cảnh',
    icon: '🎨',
    feasibility: 'verified',
    enabled: true,
    goalHint: 'Áp màu Lumetri (chọn mẫu + cường độ) cho từng cảnh.',
    help: {
      title: 'Sửa màu (Lumetri)',
      lines: [
        'Áp màu Lumetri THẬT lên clip (đã verify ghi đúng giá trị trên Premiere 26).',
        'Bấm ⚙️ chọn mẫu (Trong sáng/Điện ảnh/Ấm/Lạnh…) + cường độ, hoặc "Tự động theo cảnh".',
        'Có Xem trước (đọc-lại giá trị) → Ghi (hoàn tác bằng Ctrl-Z).',
      ],
      example: 'Chọn "Điện ảnh" 100% → mọi clip lên tông teal-cam.',
    },
  },
  {
    id: 'speed_adjust',
    category: 'speed',
    name: 'Điều chỉnh tốc độ',
    icon: '⚡',
    feasibility: 'verified',
    enabled: true,
    goalHint: 'Slow-mo cảnh động (đấu súng) + tua nhanh cảnh tĩnh, tự đo bằng AI/CV.',
    help: {
      title: 'Điều chỉnh tốc độ từng cảnh',
      lines: [
        'AI đo độ "động" (motion) mỗi clip → cảnh đấu súng SLOW-MO, cảnh tĩnh TUA NHANH.',
        'Ngưỡng lấy từ chính bộ clip của bạn (không đoán cứng); giữ pitch tiếng (atempo).',
        'Bấm ⚙️ chọn kiểu (theo nội dung/chuẩn hoá/đủ thời lượng) + độ slow-mo/min-max.',
        'Xem trước bảng tốc độ → Render ra file mới (KHÔNG đụng clip gốc; tự kéo vào timeline).',
      ],
      example: 'Cảnh trúng đạn → 0.5×; cảnh drone bay êm → 2× cho gọn.',
    },
  },
];

/** Tra cứu module theo id. */
export function getModule(id: string): EditModuleDef | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}

/** Bản rút gọn (không hàm) để gửi qua WS / render UI. */
export function moduleInfo(m: EditModuleDef): EditModuleInfo {
  return {
    id: m.id,
    category: m.category,
    name: m.name,
    icon: m.icon,
    feasibility: m.feasibility,
    goalHint: m.goalHint,
    help: m.help,
    defaultEnabled: m.defaultEnabled ?? false,
    enabled: m.enabled,
  };
}

/** Danh sách info để server expose qua module.list. */
export function listModuleInfos(): EditModuleInfo[] {
  return MODULE_REGISTRY.map(moduleInfo);
}

/** Ghép goal từ các module được tích (chỉ module enabled). */
export function buildGoalFromModules(ids: readonly string[], extra?: string): string {
  const hints = MODULE_REGISTRY.filter((m) => m.enabled && ids.includes(m.id))
    .map((m) => m.goalHint)
    .filter(Boolean);
  return [...hints, (extra ?? '').trim()].filter(Boolean).join(' ');
}

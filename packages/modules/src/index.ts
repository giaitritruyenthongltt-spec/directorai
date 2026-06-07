/**
 * @directorai/modules — Khung module edit.
 *
 * ## Kiến trúc (C4 — quyết định có chủ đích, không phải dead code)
 *
 * Gói này có HAI lớp với vai trò KHÁC nhau:
 *
 * 1. **Registry + metadata + templates + buildGoalFromModules** — ĐANG DÙNG
 *    trong production: AutoTab render checklist từ registry, server expose
 *    `module.list`, ghép goal cho AI. Đây là "mặt UI/cấu hình" của module.
 *
 * 2. **Hook `signals` / `judge` / `execute` + pipeline (`runModule`)** —
 *    ĐIỂM MỞ RỘNG (extension point) cho plugin/SDK (@directorai/sdk,
 *    plugin-loader P5.01d). Built-in module CỐ Ý để trống các hook này:
 *    TRÍ TUỆ thực thi (CV prefilter, Vision, editorial planner) sống ở
 *    **sidecar Python** — MỘT nguồn sự thật duy nhất. Nhân bản logic đó vào
 *    đây sẽ tạo 2 nguồn dễ lệch. Plugin bên thứ ba MUỐN thêm năng lực riêng
 *    thì cài 3 hook này; `runModule` chạy chúng.
 *
 * Tóm lại: registry = dùng ngay; signals/judge/execute = API cho plugin,
 * không phải scaffolding chết. (Đối chiếu báo cáo audit gap #3.)
 */

export * from './types.js';
export * from './registry.js';
export * from './pipeline.js';
export * from './templates.js';

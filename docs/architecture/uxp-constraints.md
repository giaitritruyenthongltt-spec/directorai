# Giới hạn UXP (Premiere) — phát hiện thực chiến + cách né

> UXP của Premiere KHÔNG phải trình duyệt đầy đủ. Mỗi mục dưới đây đã được xác
> minh bằng CHỤP MÀN HÌNH panel thật / gọi WS live. Tra trước khi viết UI mới.

## CSS / DOM

| Không hoạt động trong UXP                                  | Triệu chứng                | Cách né (đã dùng)                                               |
| ---------------------------------------------------------- | -------------------------- | --------------------------------------------------------------- |
| `<svg>` NỘI TUYẾN                                          | ô vuông đen                | PNG (raster sẵn)                                                |
| `-webkit-mask-image` / `mask`                              | ô vuông ĐẶC (chỉ thấy nền) | bỏ — dùng `<img>`/background                                    |
| `data:` URI trong `<img>`/CSS                              | TRẮNG (manifest v5 chặn)   | FILE ảnh cục bộ (như icons/icon23.png)                          |
| `width`/`height` trên `<img>` (attr LẪN CSS) trong flexbox | icon phình theo dòng       | bọc `<span>` set kích thước, đặt PNG làm `background-image`     |
| `<button>` chứa con phức tạp (span/img)                    | con bị NUỐT (không vẽ)     | `<div role="button" tabIndex onKeyDown>` (primitive `ClickBox`) |
| `min()`/`max()`/`clamp()`                                  | thuộc tính bị BỎ QUA       | giá trị px THUẦN (cap inline)                                   |
| đơn vị `vh`/`vw`                                           | bị BỎ QUA                  | px thuần                                                        |

## Render được (an toàn)

- PNG qua `<img src="file.png">` và `background-image: url(file.png)` (file cục bộ).
- Box CSS trên `<div>`/`<span>` (width/height/padding px, flex, gradient, border-radius, box-shadow).
- Emoji "symbol" cơ bản (⚠ ⚡ ● ✓) — NHƯNG emoji màu mới (🎬🎞📊) thiếu glyph → tofu. KHÔNG dựa vào emoji cho icon.
- Font hệ thống + @font-face (chưa thử kỹ).

## Icon = quy ước dự án (đã chốt)

1. SVG nguồn ở `tools/gen-ui-icons.mjs` → raster PNG 64px (sharp, một-lần) → `apps/panel/icons/ui/*.png` (commit), CopyWebpackPlugin → `dist/icons/ui/`.
2. `components/Icon.tsx`: `<span>` set `width/height` + `background-image: url("icons/ui/<name>.png")`.
3. Mọi PHẦN TỬ BẤM dùng `<div role=button>` (primitive `Button`/`ClickBox`), KHÔNG `<button>`, để icon hiện.
4. Icon ĐƠN SẮC (#cfd3da); trạng thái active thể hiện qua nhãn/underline, không qua màu icon.

## Quy trình debug UXP (đã thiết lập)

- **UDT Watch BẬT** = tự reload panel mỗi lần `pnpm -C apps/panel build` (không phải click Reload tay).
- **Box "Nhật ký vận hành"** trong panel (LogDrawer) = xem lỗi/sự kiện + Sao chép, không cần mở UDT DevTools.
- Tự kiểm chứng bằng chụp màn hình (PowerShell System.Drawing) + gọi WS live (`ws://127.0.0.1:7778`, JSON-RPC 2.0).

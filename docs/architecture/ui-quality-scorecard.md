# Bảng chấm điểm chất lượng giao diện + phương án nâng cấp

> Đối soát từ ảnh chụp thực tế (panel rộng ~1200px, dự án "PHONG DEP TRUY_6_1",
> tap 11, 413 clip) + code. Chấm trước/sau khi sửa bug icon.

## 1. Bug phát hiện (ưu tiên)

| Mã     | Bug                                                           | Mức          | Bằng chứng (ảnh)                                                 | Trạng thái                              |
| ------ | ------------------------------------------------------------- | ------------ | ---------------------------------------------------------------- | --------------------------------------- |
| **B1** | **Icon SVG → ô vuông đen ■**                                  | 🔴 nặng      | logo, "Dựng phim Nerf dài", "1. Nguồn clip", "Premiere", nút gửi | ✅ ĐÃ SỬA (mask data-URI)               |
| **B2** | **"Lấy path tự động" → 0/413 có path**; mọi clip kind="audio" | 🔴 chặn dùng | bảng clip toàn "⚠ chưa map", cột loại = audio                    | ⏳ tách việc (chức năng, không phải UI) |
| **B3** | **Panel rộng → 2 bên trống lớn** (nội dung khóa 760px giữa)   | 🟠           | gutter ~220px mỗi bên                                            | ⏳ kế hoạch U-Wide                      |
| **B4** | Nhãn **"Đường dẫn"** lạc giữa header                          | ⚪ nhẹ       | text top-center không rõ chức năng                               | ⏳ kiểm tra                             |

> B1 là nguyên nhân chính khiến nhìn "vỡ/bug". Đã sửa: UXP không render `<svg>`
> nội tuyến (DOM tùy biến) → chuyển sang SVG-as-mask (engine CSS Chromium render
> được), giữ `currentColor` nên vẫn đổi màu theo theme.

## 2. Chấm điểm theo hạng mục (thang 10)

| #   | Hạng mục                             | Điểm (hiện) | Sau khi sửa | Ghi chú                                                  |
| --- | ------------------------------------ | :---------: | :---------: | -------------------------------------------------------- |
| 1   | **Hiển thị icon**                    |      1      |      9      | B1 làm hỏng toàn bộ; sau mask → sắc nét, themeable       |
| 2   | **Điều hướng & cấu trúc (IA)**       |      7      |      8      | 3 nhóm/6 tab rõ; 2 tầng nav hơi tốn dọc ở panel thấp     |
| 3   | **Tận dụng không gian (panel rộng)** |      4      |      7      | B3: khóa 760px → trống 2 bên; cần co giãn theo bề rộng   |
| 4   | **Phân cấp thị giác**                |      6      |      8      | nút chính/phụ đã khác; cần nhấn tiêu đề + khoảng thở     |
| 5   | **Nhất quán (design token)**         |      7      |      8      | đa số token hóa; vài CSS cũ còn hex                      |
| 6   | **Trạng thái & phản hồi**            |      7      |      8      | có empty/loading/error; thiếu skeleton khi nạp clip      |
| 7   | **Bảng dữ liệu clip**                |      5      |      6      | virtualize tốt; nhưng B2 (kind sai + 0 path) phá tin cậy |
| 8   | **Độ rõ luồng tác vụ**               |      7      |      8      | 4 bước rõ; nên đánh số bước nổi hơn + khóa bước chưa tới |
| 9   | **Theme & tương phản**               |      6      |      7      | dark ổn; light theme icon/nền chưa kiểm kỹ               |
| 10  | **Ngôn ngữ VN nhất quán**            |      8      |      9      | đã Việt hóa gần hết; còn ít chuỗi kỹ thuật               |
|     | **TỔNG**                             | **58/100**  | **78/100**  | mục tiêu sau U-Wide + B2 → ~88                           |

## 3. Tổng quan & nhận định

**Điểm mạnh:** cấu trúc 3-nhóm rõ; luồng "nạp → kế hoạch → duyệt → ghi" mạch lạc;
đã có empty-state, virtualize bảng, token màu, Việt hóa tốt.

**Điểm yếu lớn nhất (xếp ưu tiên):**

1. **B1 icon vỡ** (đã sửa) — phá toàn bộ ấn tượng "chuyên nghiệp".
2. **B3 không tận dụng bề rộng** — panel rộng mà cột nội dung hẹp + 2 bên trống
   ⇒ vẫn cảm giác "sơ khai/trống". Cần layout co giãn.
3. **B2 lấy path = 0** — lỗi CHỨC NĂNG nhưng làm UI mất tin cậy (bảng toàn cảnh
   báo vàng). Tách việc sửa riêng.

## 4. Phương án nâng cấp (nhóm U — sau bug)

| #           | Việc                                                                                                                                              | Ưu tiên         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **U-Wide**  | Panel rộng: nới cột nội dung (max-width 760→responsive `min(1100px, 100%)`); bảng clip & thẻ dùng hết bề rộng, chỉ phần văn bản giữ hẹp để dễ đọc | 🟠 cao          |
| **U-Head**  | Header: bỏ/nhận diện nhãn "Đường dẫn" lạc; gom tiêu đề trang vào 1 dải rõ                                                                         | 🟡              |
| **U-Step**  | Đánh số bước to + trạng thái khóa (bước chưa tới mờ đi) cho luồng Phim dài/Đạo diễn                                                               | 🟡              |
| **U-Skel**  | Skeleton/▁ nhấp nháy khi đang nạp clip thay vì nhảy nội dung                                                                                      | ⚪              |
| **U-Light** | Kiểm thử theme sáng (icon mask + nền thẻ)                                                                                                         | ⚪              |
| **B2-fix**  | (Chức năng) sửa resolveFromProject: 413 clip → 0 path + kind "audio" sai                                                                          | 🔴 tách session |

## 5. Tiêu chí "đạt"

- Reload: KHÔNG còn ô vuông đen — mọi icon hiện sắc nét, đổi màu theo theme.
- Panel rộng 1200px: nội dung dùng hết bề ngang hợp lý, không gutter trống lớn.
- Bảng clip báo đúng loại (video/audio) và có path khi bấm "Lấy path".

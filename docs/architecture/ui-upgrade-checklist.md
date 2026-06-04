# Danh sách nâng cấp giao diện DirectorAI — checklist tự kiểm chứng

> Tự verify bằng CHỤP MÀN HÌNH Premiere (không hỏi người dùng). Mỗi mục PASS khi
> ảnh chụp thực tế đạt tiêu chí. Cập nhật trạng thái sau mỗi vòng.

## A. Bug chặn (phải PASS trước)

| Mã     | Hạng mục               | Tiêu chí PASS (nhìn trên ảnh)                                                                       | TT                      |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------- | ----------------------- |
| **U1** | **Icon hiển thị**      | Logo, tiêu đề, "1. Nguồn clip", nút, status… có ICON THẬT; KHÔNG ô vuông đen/đặc, KHÔNG trắng/thiếu | ✅ (chụp xác minh szT6) |
| **U6** | **Danh sách clip gọn** | Bảng clip là 1 hộp cao ~340px, có thanh cuộn RIÊNG; cả trang không bị danh sách dài chiếm hết       | ✅                      |

> **Gốc rễ U1 (đã giải bằng chụp màn hình Premiere):** UXP Premiere — (1) KHÔNG
> render `<svg>` nội tuyến, `mask-image`, hay `data:` URI; (2) render PNG trong
> `<img>` NHƯNG không nhận width/height; (3) `<button>` NUỐT icon span. → Lời
> giải: icon = PNG (raster sẵn) đặt background-image trên `<span>` set kích
> thước; mọi nút bấm chuyển sang `<div role=button>`. UDT bật **Watch** = tự
> reload mỗi build (vòng kiểm chứng nhanh).

## B. Bố cục & hệ thiết kế

| Mã      | Hạng mục                                                                    | Tiêu chí PASS | TT  |
| ------- | --------------------------------------------------------------------------- | ------------- | --- |
| **U2**  | Nav 2 tầng có icon, tab đang chọn nổi (nền/underline accent)                | ⏳            |
| **U3**  | Header: logo icon + chấm trạng thái màu (xanh "Đã kết nối")                 | ⏳            |
| **U5**  | Panel rộng: nội dung dùng bề ngang hợp lý, không trống 2 bên lớn            | ⏳            |
| **U7**  | Nút chính (Lấy path/Lập kế hoạch/Ghi) nổi bật accent/gradient; nút phụ viền | ⏳            |
| **U9**  | Thanh cuộn mỏng đúng tông tối                                               | ⏳            |
| **U10** | Tiêu đề mục có số bước + nhấn thị giác (accent bar/đậm)                     | ⏳            |

## C. Nội dung & trạng thái

| Mã      | Hạng mục                                                           | Tiêu chí PASS | TT  |
| ------- | ------------------------------------------------------------------ | ------------- | --- |
| **U4**  | Tab Nâng cao: tiếng Việt + thẻ + empty-state (không còn tiếng Anh) | ⏳            |
| **U8**  | Trạng thái loading/empty/error có icon + màu ngữ nghĩa             | ⏳            |
| **U11** | Theme sáng (nếu host sáng): icon + nền thẻ vẫn đọc được            | ⏳            |

## D. Chức năng (ngoài UI, tách nhưng phải ghi nhận)

| Mã     | Hạng mục                                                               | Tiêu chí | TT  |
| ------ | ---------------------------------------------------------------------- | -------- | --- |
| **B2** | "Lấy path tự động" ra path thật + loại đúng (video/audio), không 0/413 | ⏳       |

## Quy trình tự kiểm chứng (vòng lặp)

1. Sửa code → `pnpm -C apps/panel build`.
2. Reload panel trong Premiere (script/automation).
3. CHỤP màn hình → tự đọc ảnh → đối chiếu tiêu chí từng mục.
4. Mục nào fail → quay lại (1). Lặp tới khi U1+U6 PASS, rồi B/C.
5. Ghi trạng thái ✅/❌ vào bảng này mỗi vòng.

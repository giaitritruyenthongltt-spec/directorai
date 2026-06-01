# DirectorAI — CHUỖI PHASE "Triển khai full" (B-series)

> Tiếp nối sau SAFE-1 (Tầng an toàn cơ bản đã xong). Mỗi phase verify bằng
> unit-test; phần cần Premiere live đánh dấu 🔴 (verify khi panel sẵn sàng).
> Thứ tự theo giá trị + phụ thuộc.

| Phase   | Tên                                   | Nội dung                                                                           | Verify         |
| ------- | ------------------------------------- | ---------------------------------------------------------------------------------- | -------------- |
| **B1**  | SAFE-2 Checkpoint + Report            | Tự snapshot trước ghi (nối P4.06) + chế độ báo-cáo (xuất quyết định ra file)       | unit           |
| **B2**  | MOD-1 Khung module                    | package `@directorai/modules`: types (signals/judge/execute) + registry + pipeline | unit           |
| **B3**  | MOD-1b Module hoá + AutoTab tự render | đưa 4 thao tác (lọc/tỉa/xếp/đổi tên) thành module; AutoTab render từ registry      | unit           |
| **B4**  | MOD-3 CV-prefilter                    | tầng CV rẻ lọc ứng viên → Vision chỉ xem clip nghi ngờ (giảm chi phí Gemini)       | unit + sidecar |
| **B5**  | COST-1 Cụm hoá Vision                 | gom clip giống nhau (hash khung) → chỉ hiểu 1 đại diện                             | unit           |
| **B6**  | MOD-5 Báo cáo + Tab Phân tích         | sinh báo cáo chất lượng CSV/HTML + AnalysisTab UI                                  | unit           |
| **B7**  | MOD-7 Template Nerf                   | lưu/đọc cấu hình module + nút preset 1-click trong AutoTab                         | unit           |
| **B8**  | MOD-4 Màu Lumetri                     | introspect color component chain → apply màu/exposure (Action model)               | 🔴 live        |
| **B9**  | TX transition                         | introspect transition API Premiere 26 → bật executor hoặc tài liệu hoá             | 🔴 live        |
| **B10** | FCPXML (Tầng 4)                       | package `@directorai/fcpxml`: sinh split/auto-build/speed/marker/beat-cut          | unit           |

**Nguyên tắc**: không phá vỡ test hiện có (97+ server, 15 adapter); mỗi phase
1 commit; trung thực "code xong" vs "verify live".

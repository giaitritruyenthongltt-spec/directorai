# DirectorAI — CHUỖI PHASE "Triển khai full" (B-series)

> Tiếp nối sau SAFE-1 (Tầng an toàn cơ bản đã xong). **TRẠNG THÁI: 10/10
> phase xong** — 8 ✅ verify (unit/live), 2 🟡 (B8/B9 cần 1 lần reload panel
>
> - verify live; introspect đã chứng minh transition/màu GHI ĐƯỢC).

| Phase   | Tên                                   | Nội dung                                                         | Verify                                |
| ------- | ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| **B1**  | SAFE-2 Checkpoint + Report            | Tự snapshot trước ghi (nối P4.06) + chế độ báo-cáo               | ✅ 3 test                             |
| **B2**  | MOD-1 Khung module                    | package `@directorai/modules`: types + registry + pipeline       | ✅ 10 test                            |
| **B3**  | MOD-1b Module hoá + AutoTab tự render | 4 thao tác thành module; AutoTab render từ registry              | ✅                                    |
| **B4**  | MOD-3 CV-prefilter                    | CV rẻ lọc → Vision chỉ xem clip nghi                             | ✅ live (vision_calls=0 khi clip tốt) |
| **B5**  | COST-1 Cụm hoá Vision                 | gom clip giống nhau (aHash) → hiểu 1 đại diện                    | ✅ live (5→4 cụm)                     |
| **B6**  | MOD-5 Báo cáo + Tab Phân tích         | qualityReport CSV/HTML + AnalysisTab + fix routing composite     | ✅ live                               |
| **B7**  | MOD-7 Template Nerf                   | 4 template built-in + nút 1-click                                | ✅                                    |
| **B8**  | MOD-4 Màu Lumetri                     | introspect: VideoFilterFactory + getComponentChain tồn tại       | 🟡 beta (verify)                      |
| **B9**  | TX transition                         | introspect: createAddVideoTransitionAction TỒN TẠI; probe-0 path | 🟡 path sẵn (verify)                  |
| **B10** | FCPXML (Tầng 4)                       | `@directorai/fcpxml`: spine/split/speed/marker + fcpxml.export   | ✅ 7 test                             |

**Nguyên tắc**: không phá vỡ test hiện có; mỗi phase 1 commit; trung thực
"code xong" vs "verify live". 8 ✅ / 2 🟡.

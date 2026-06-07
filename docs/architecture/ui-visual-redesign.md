# Nâng cấp giao diện toàn diện — phân tích + sơ đồ khắc phục

> Phản hồi người dùng: "giao diện quá basic… thêm icon, danh mục rõ ràng,
> hiển thị đẹp mắt". Đối soát code thật + dẫn chiếu các hệ thiết kế chất lượng.

## 1. Tài liệu/hệ thiết kế tham chiếu (cơ sở khoa học)

| Nguồn                                                                                 | Vì sao chọn                                                           | Áp dụng vào DirectorAI                                                                       |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Adobe Spectrum** (spectrum.adobe.com)                                               | Hệ thiết kế CHÍNH THỨC của Adobe — panel UXP nên "dính" host Premiere | Thang spacing 4px, accent = host-blue, elevation lớp bề mặt, sentence-case (không UPPERCASE) |
| **Lucide / Feather icons** (MIT)                                                      | Icon stroke 24px, đồng nhất, nhẹ, `currentColor`                      | Hệ icon SVG nội tuyến thay emoji                                                             |
| **Nguyên tắc UI chung** (8pt grid, hệ phân cấp thị giác, empty state, semantic color) | Chuẩn ngành                                                           | Token hóa, thẻ (card), trạng thái rỗng có hướng dẫn                                          |

## 2. Vấn đề (đối soát code, có bằng chứng)

| #         | Vấn đề                                  | Bằng chứng                                               | Hệ quả                                                 |
| --------- | --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| **V1** 🔴 | **Emoji → "tofu" □□**                   | UXP webview thiếu font emoji; App.tsx/Header dùng 🎬⚡🔍 | Tab hiện "□□ Phim dài", logo "□ DirectorAI" → trông VỠ |
| **V2** 🟠 | Không có **hệ icon** thống nhất         | emoji rải khắp (DirectorTab 255, FilmTab 150…)           | Mỗi chỗ một kiểu, không kiểm soát được hiển thị        |
| **V3** 🟠 | Tab **Nâng cao còn tiếng Anh**          | ContextTab "Ingest/Transcribe/Find Scenes…"              | Lệch ngôn ngữ, khó hiểu với người Việt                 |
| **V4** 🟡 | Nút **phẳng xám, thiếu phân cấp**       | App.css nút xám, UPPERCASE letter-spacing                | Trông "kỹ thuật/thô", không phân biệt chính-phụ        |
| **V5** 🟡 | **Hardcode hex** không dùng token       | ContextTab.css `#2b2b30/#444…`                           | Lệch theme, khó bảo trì                                |
| **V6** ⚪ | **Bố cục trống trải** ở tab ít nội dung | Trợ lý/Nâng cao nhiều khoảng trắng                       | Cảm giác sơ khai, thiếu đầu tư                         |

## 3. Sơ đồ khắc phục (kiến trúc thị giác: hiện tại → mục tiêu)

```
HIỆN TẠI                                    MỤC TIÊU (Spectrum-inspired)
─────────────────────────────────          ──────────────────────────────────
[□ DirectorAI]        ● Đã kết nối          [▣ DirectorAI v2.1]   ◉ Đã kết nối
┌────────────────────────────────┐          ┌──────────────────────────────────┐
│ [□ Dựng phim][□ Trợ lý][□□..]  │  nav     │ [▤ Dựng phim][✦ Trợ lý][⊟ Nâng]  │ icon SVG
│ [□□ Phim dài][⚡Tự động][□ ..] │  tofu →  │ [▤ Phim dài][⚡ Tự động][▦ Báo]   │ + underline accent
├────────────────────────────────┤          ├──────────────────────────────────┤
│ nút xám phẳng, chữ HOA, hex     │  thân →  │ thẻ (card) elevation, nút có icon,│
│ hardcode, tiếng Anh, trống      │          │ accent semantic, empty-state,     │
│                                 │          │ token hóa, sentence-case          │
└────────────────────────────────┘          └──────────────────────────────────┘
```

Nguyên tắc:

1. **MỘT nguồn icon** (`Icon.tsx`, SVG `currentColor`) — hết tofu, tự đổi theme.
2. **Token hóa** màu/đổ bóng/khoảng cách (Spectrum 4px grid) — 1 nguồn, themeable.
3. **Phân cấp thị giác**: accent cho hành động chính, layer bề mặt cho chiều sâu.
4. **Sentence-case tiếng Việt** (bỏ UPPERCASE "techy").
5. **Empty state có hướng dẫn** thay vì khoảng trắng trống.

## 4. Danh sách phase (nhóm R — Visual redesign)

| #      | Việc                                                                                                | Trạng thái |
| ------ | --------------------------------------------------------------------------------------------------- | ---------- |
| **R1** | Hệ icon SVG `Icon.tsx` (Lucide-style, ~30 icon) — sửa gốc tofu                                      | ✅ xong    |
| **R2** | Nâng `tokens.css`: elevation (layer-1/2/3), accent ramp, focus ring, shadow, `.icon`                | ✅ xong    |
| **R3** | Nav nhóm + tab dùng icon, segmented control, bỏ UPPERCASE                                           | ✅ xong    |
| **R4** | Header: logo icon clapperboard + chấm trạng thái màu (pulse)                                        | ✅ xong    |
| **R5** | Việt hóa + dựng lại tab Nâng cao (thẻ + icon + empty state)                                         | ✅ xong    |
| **R6** | FilmTab/AutoTab/ClipSourcePanel dùng Icon (primitive nhận iconName); trạng thái 🔵🟡 → chấm màu CSS | ✅ xong    |
| **R7** | DirectorTab + WorkflowDiagram + AnalysisTab: icon bước/nút/persona; bỏ emoji select                 | ✅ xong    |
| **R8** | CommandBar (nút gửi) + StatusBar dùng Icon                                                          | ✅ xong    |

> Còn lại (tùy chọn): emoji trong dữ liệu template/module (`@directorai/modules`)
> và các modal một-lần (ConsentDialog/Wizard/Tour) — ít hiển thị, để pha sau nếu cần.

## 5. Tiêu chí "đẹp & xong"

- KHÔNG còn ô vuông tofu ở bất kỳ tab nào (toàn icon SVG sắc nét).
- Tab đang chọn có accent rõ (underline/nền nhạt) — biết mình đang ở đâu.
- Nút hành động chính nổi bật (accent/gradient) so với nút phụ.
- Tab ít nội dung có empty-state hướng dẫn, không trống trải.
- Toàn bộ màu lấy từ token → đồng bộ theme tối/sáng của Premiere.

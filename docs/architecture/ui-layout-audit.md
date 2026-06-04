# Audit layout/sizing/scroll của panel + sơ đồ khắc phục tối ưu

> Phản hồi người dùng: tỉ lệ khung panel, thanh cuộn, độ co giãn "mới sơ khai".
> Đối soát code thật (App.css, \*.css, manifest). Tìm 1 BUG nghiêm trọng + 5 vấn
> đề cấu trúc.

## 1. Kiến trúc layout HIỆN TẠI (từ code)

Manifest: `min 320×480 · preferred 400×600 · max 800×2048` → panel **hẹp & thấp**
là mặc định, nhưng người dùng dock **rất rộng** (≈1800px) → lệch tỉ lệ.

```
.app  (flex column, height:100vh)
 ├─ <Header>              auto
 ├─ <nav.tab-groups>      auto   ┐ 2 hàng nav
 ├─ <nav.tabs>            auto   ┘  (chiếm cao)
 ├─ <main.main-content>   flex:1; overflow:HIDDEN   ← ranh giới cắt
 │     └─ .film-tab { overflow-y:auto; /* THIẾU height:100% */ }
 │           ├─ ClipSourcePanel → .clt-scroll { max-height:320px; overflow-y:auto }  ← scroll #2
 │           └─ .film-steplist { max-height:220px; overflow-y:auto }                 ← scroll #3
 ├─ <ProgressBar>         auto   ┐
 ├─ <CommandBar>          auto   ┤ footer chiếm cao
 └─ <StatusBar>           auto   ┘
```

## 2. VẤN ĐỀ (có file:line)

| #         | Vấn đề                                                                                                   | Bằng chứng                                                       | Hệ quả                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **L1** 🔴 | **Scroll GÃY** — tab có `overflow-y:auto` nhưng KHÔNG `height:100%`; cha `.main-content overflow:hidden` | FilmTab.css:3-8, AutoTab.css:1-6, App.css:68-71                  | Tab cao theo nội dung → vượt main-content → bị **CẮT đáy, KHÔNG cuộn tới** ở panel thấp. Nút "Xem trước/Ghi" bị khuất. |
| **L2** 🟠 | **Scroll LỒNG nhau** (3 thanh)                                                                           | ClipTable.css:36, FilmTab.css (steplist 220), ContextTab.css:109 | Lăn chuột trên bảng → cuộn bảng (320px) không cuộn trang; "scroll trap" khó chịu.                                      |
| **L3** 🟠 | **Không co giãn CHIỀU CAO** — bảng clip cứng 320px                                                       | ClipTable.css:36 `max-height:320px`                              | Panel cao 1200px → thừa chỗ trống; panel 480px → chật + cuộn đôi.                                                      |
| **L4** 🟡 | **Không co giãn CHIỀU RỘNG** — thiết kế 400px, dùng 1800px                                               | không có max-width container                                     | Nội dung dãn ngang trống trải; bảng clip kéo dài xấu.                                                                  |
| **L5** 🟡 | **Thanh cuộn KHÔNG style**                                                                               | grep scrollbar = rỗng                                            | Dùng scrollbar mặc định webview (to/xấu, lệch theme).                                                                  |
| **L6** ⚪ | **Spacing px cứng** vài chỗ (chưa dùng token)                                                            | AutoTab.css:5 `12px 14px`, AnalysisTab.css                       | Lệch nhịp với phần đã token hóa.                                                                                       |

## 3. Kiến trúc TỐI ƯU (mục tiêu)

```
.app  (display:grid; grid-template-rows: auto auto 1fr auto; height:100%; min-height:0)
 ├─ Header                       (auto)
 ├─ Nav  (1 hàng; ở panel hẹp gộp group+tab, wrap)   (auto)
 ├─ main  (1fr; min-height:0; overflow-y:AUTO)        ← THANH CUỘN DUY NHẤT
 │    └─ .tab  (height:auto; KHÔNG overflow riêng;
 │             max-width:760px; margin:0 auto)         ← căn giữa, không dãn xấu
 │         ├─ các Section  (cao tự nhiên)
 │         ├─ ClipTable    (cao theo CHỖ TRỐNG, KHÔNG max-height cứng;
 │         │               header bảng position:sticky)
 │         └─ Steplist     (bỏ max-height; cuộn chung với trang)
 └─ Footer (Progress+Command+Status)  (auto, gọn)
```

Nguyên tắc:

1. **MỘT thanh cuộn** ở `main` (bỏ overflow ở tab + bỏ max-height ở bảng/steplist).
2. **min-height:0** ở main để grid/flex cho phép cuộn (không bị đẩy cao vô hạn).
3. **max-width container** (~760px) căn giữa → panel rộng không trống trải.
4. **Bảng clip co giãn** theo chỗ trống (không cứng 320px), header sticky.
5. **Scrollbar mỏng** theo token màu.

## 4. Danh sách khắc phục (nhóm L — UI layout)

| #      | Việc                                                                                                                                         | Ưu tiên                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **L1** | `.app` → grid rows `auto auto 1fr auto`; `main` = scroller DUY NHẤT (`overflow-y:auto; min-height:0`); tab bỏ `overflow-y`, để `height:auto` | 🔴 cao (sửa bug cắt nội dung) |
| **L2** | Bỏ `max-height` ở `.clt-scroll` + `.film-steplist` + ContextTab result → cuộn chung                                                          | 🟠                            |
| **L3** | ClipTable: header `position:sticky`; thân cao theo chỗ trống (hoặc cap mềm `min(60vh, …)`)                                                   | 🟠                            |
| **L4** | `.tab` (mọi tab) `max-width:760px; margin:0 auto` → co giãn rộng đẹp                                                                         | 🟡                            |
| **L5** | Style scrollbar mỏng theo theme (`::-webkit-scrollbar*` trong tokens)                                                                        | 🟡                            |
| **L6** | Nav: panel hẹp gộp group+tab 1 hàng, `flex-wrap`; giảm cao header/footer                                                                     | 🟡                            |
| **L7** | Spacing px cứng → token (AutoTab/AnalysisTab)                                                                                                | ⚪                            |
| **L8** | (sâu) Virtualize ClipTable cho 400+ dòng (render ~50/lần)                                                                                    | ⚪ sau                        |

## 5. Tiêu chí "xong"

- Kéo panel **thấp (480px)**: vẫn cuộn tới được MỌI nút (không bị cắt) bằng **1 thanh cuộn**.
- Kéo panel **rộng (1200px)**: nội dung căn giữa, không dãn trống.
- Lăn chuột ở bảng clip → cuộn cả trang mượt (không kẹt scroll lồng).
- Thanh cuộn mỏng, đúng tông tối/sáng.

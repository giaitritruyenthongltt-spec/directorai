# Chuỗi phase: DirectorAI → Phim Nerf điện ảnh (Long-form pivot)

> Quyết định người dùng (2026-06-02): dựng **phim Nerf có cốt truyện** (3 hồi,
> chương, mạch nhân vật, màu/nhạc theo đoạn), KHÔNG phải shorts. UI: **chuẩn
> hóa + thêm timeline** (không đập đi xây lại từ 0). Thứ tự: Claude tự xếp.
>
> Chẩn đoán nền (4 agent phân tích sâu — xem `docs/research/longform-audit`):
> cả template/preset/planner/cutOnBeats/data-model/UI/scale đều **bias montage
> 45s**. Giữ nguyên 3 tầng tốt: kiến trúc AI 4 tầng, cơ chế an toàn
> (preview+checkpoint+approval), adapter ghi thật. Làm mạnh tay 2 tầng:
> planner/template (long-form) và UI (chuẩn hóa + timeline).

Thứ tự thực thi: **S (nền tảng) → DM (data model) → LF (bộ não) → UI**.

---

## Nhóm S — Nền tảng scale (để 413 clip chạy nhanh, không treo)

Nguồn: agent #4 đo được 3 nút thắt. Mục tiêu: exec 413 clip **80s → ~25s**,
100 thao tác → **1 undo** thay vì 100.

| Phase  | Việc                                                                  | Trạng thái                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1** | Dedup `listClips` — cache theo sequenceId, mọi mutation xóa. Bỏ 3×→1× | ✅ XONG (commit)                                                                                                                                                             |
| **S2** | ~~Tối ưu `applyMovesToOrder`~~                                        | ❌ BỎ — agent tính nhầm: code hiện tại đã là O(K·M) (indexOf+2×splice mỗi O(K), lặp M lần), 413×10≈4.130 thao tác, đủ nhanh                                                  |
| **S3** | Cache `findTrackItem` bền qua mutation                                | ⏸️ HOÃN — rủi ro: clip không có nodeId dùng synthetic id `track:ticks:name`; MOVE/TRIM đổi start→đổi id→cache cũ. Giá trị có điều kiện. Revisit sau khi apply live chạy được |
| **S4** | Gộp N mutation → 1 transaction (1 undo)                               | ⏸️ HOÃN — refactor lớn plan-executor; làm khi vào tối ưu apply sâu                                                                                                           |
| **S5** | Perf smoke 413 clip                                                   | ⏸️ Cần mở Premiere live (đo trước/sau)                                                                                                                                       |

> Kết luận nhóm S: **S1 là nút thắt THẬT duy nhất** (đã sửa). Phần còn lại là
> micro-opt rủi ro/điều kiện → hoãn để dồn sức vào DM+LF (giá trị cốt lõi cho
> phim điện ảnh). Trung thực: không sửa thừa.

## Nhóm DM — Mô hình dữ liệu long-form (chương/đoạn/vai trò track)

Nguồn: agent #1 + #4 — data model phẳng, thiếu chapter/segment/track-role/
metadata. Cần cho phim có cốt truyện.

| Phase   | Việc                                    | Cụ thể                                                                                                                                                                        |
| ------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DM1** | Mở rộng `core` types                    | `Chapter{id,name,start,end,color}`, `Segment{purpose,clipIds}`, `TrackRole='video'\|'music'\|'dialog'\|'sfx'\|'ambient'`, `Clip.metadata{scene_class,motion,quality,emotion}` |
| **DM2** | Adapter đọc marker→chapter + track role | introspect API marker Premiere 26; listClips trả metadata cache                                                                                                               |
| **DM3** | Ghi chapter marker                      | createMarker (sau introspect); đặt tên chương lên timeline                                                                                                                    |

## Nhóm LF — Bộ não long-form (tinh túy của lần pivot này)

Nguồn: agent #1 + #2. Định hướng lại planner + template cho phim điện ảnh.

| Phase   | Việc                                        | Cụ thể                                                                                                                            | Giá trị       |
| ------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **LF1** | Mở rộng schema request planner              | `target_duration_sec`, `keep_ratio`, `pacing_profile`, `structure='3act'\|'chapters'\|'recap'`, `chapters[]` (Python models + TS) | nền           |
| **LF2** | Viết lại prompt planner cho điện ảnh        | 3 hồi (setup→đối đầu→giải quyết), ngân sách thời lượng, giữ ~keep_ratio%, mạch nhân vật, đoạn có mục đích                         | ⭐⭐⭐        |
| **LF3** | Output = "bản đồ timeline"                  | chương→đoạn→clip có **vị trí tuyệt đối + nhóm chương + loại nhịp**, thay cho list step phẳng                                      | ⭐⭐⭐        |
| **LF4** | Module **cắt dead-air/khoảng lặng tự động** | biến `detectSilences` thành plan trim; ngưỡng theo loại đoạn (dialog giữ 0.5s, hành động cắt sát)                                 | ⭐⭐⭐ (hero) |
| **LF5** | Nhịp theo nội dung (pacing curve)           | mỗi chương có đường nhịp (build→peak→calm); không chỉ theo beat                                                                   | ⭐⭐          |
| **LF6** | Sửa cut cho clip dài                        | cắt TRONG clip dài (không bỏ qua khi beat gần cạnh); hoặc cut theo nội dung/scene                                                 | ⭐⭐          |
| **LF7** | Template điện ảnh Nerf                      | "Phim Nerf 3 hồi", "Recap trận theo hiệp/chương", có mục tiêu thời lượng (thay template 45s)                                      | ⭐⭐⭐        |
| **LF8** | Scale Vision 413 clip                       | ngân sách cluster+sampling; guard chi phí Gemini; ưu tiên clip key-moment                                                         | ⭐⭐          |

## Nhóm UI — Chuẩn hóa + timeline (lộ ra năng lực long-form)

Nguồn: agent #3. Refactor có kiểm soát (giữ tính năng), KHÔNG xóa sạch.

| Phase   | Việc                              | Cụ thể                                                                                                   |
| ------- | --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **UI1** | Design tokens                     | 1 `tokens.css`: thang spacing/typography/color/shadow; bỏ ~24 magic number; thống nhất `--ui-*` về `--*` |
| **UI2** | Component dùng chung              | Button/Input/Textarea/Select/ErrorBox/Section — diệt ~400 dòng CSS trùng                                 |
| **UI3** | Chuẩn hóa state                   | hook `useAsync(fn)` cho busy/error/result; Context `GlobalState` (conn/logs/wsClient)                    |
| **UI4** | Gộp tab thành 1 luồng "Dựng phim" | Auto+Director+Style → 1 wizard: Quét → Hiểu → Kế hoạch → Duyệt → Ghi                                     |
| **UI5** | **Khung Timeline/Chương**         | render chương→đoạn→clip; tổng quan cấu trúc phim dài; nhảy theo chương                                   |
| **UI6** | Trình duyệt clip (bảng)           | thay 1 ô textarea bằng bảng có sort/lọc cho 400+ clip                                                    |
| **UI7** | Điều khiển màu/nhạc theo chương   | mỗi chương 1 look/nhạc; nối với LF                                                                       |
| **UI8** | Đồng bộ theme host Premiere       | sáng/tối khớp Premiere (học từ SADESIGN)                                                                 |

---

## Tiêu chí "xong" mỗi nhóm

- **S**: smoke 413 clip preview <5s, apply 100 step <25s, 1 undo; tất cả test cũ xanh.
- **DM**: core types có chapter/segment/role + metadata; adapter đọc được; test.
- **LF**: planner nhận thời lượng mục tiêu + sinh bản đồ timeline có chương; dead-air
  trim chạy trên clip Nerf thật; template điện ảnh thay 45s.
- **UI**: design token thống nhất; 1 luồng dựng phim; timeline/chương hiển thị
  413 clip mượt; theme đồng bộ host.

> Ghi chú: C9 (verify ghi thật) vẫn treo — sẽ verify live khi user mở sequence test.

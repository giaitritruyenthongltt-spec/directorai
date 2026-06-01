# Kiến trúc AI hiểu toàn diện — DirectorAI

> Nguyên tắc cốt lõi (người dùng chỉ ra 2026-06-01):
> "Phân tích cứng rất dễ hỏng nội dung. Cần AI hiểu TỔNG TOÀN BỘ nội dung
> video, file thô, quy trình dựng, kế hoạch edit — như người edit thật."

---

## 1. Vì sao "phân tích cứng" nguy hiểm (lấy ví dụ video Nerf)

| Quyết định cứng              | Sai lầm thực tế                                           | Hậu quả                    |
| ---------------------------- | --------------------------------------------------------- | -------------------------- |
| "Tắt clip blur > ngưỡng"     | Khoảnh khắc **trúng đạn Nerf** luôn motion-blur cao       | Xoá đúng cảnh đắt giá nhất |
| "Cắt mọi khoảng lặng"        | Khoảng lặng trước khi **bóp cò** là kịch tính có chủ đích | Phá nhịp, mất cao trào     |
| "Giữ top-10 điểm chất lượng" | Clip "đẹp" có thể là cảnh đứng tạo dáng nhàm chán         | Bỏ action, giữ cảnh tĩnh   |
| "Cảnh tối = kém"             | Cảnh núp bắn trong bóng tối là CHỦ Ý                      | Xoá nội dung cố tình       |

→ **Con số không biết Ý NGHĨA.** `composite 0.35` không phân biệt được
"mờ do lỗi" với "mờ do action đỉnh". Chỉ AI **xem và hiểu** mới phân biệt.

---

## 2. Kiến trúc 4 tầng — AI hiểu như người edit

```
┌─ TẦNG 1: Tín hiệu thô (Python CV) ──────────────────┐
│  blur, motion, màu, beat, silence, ranh giới cảnh   │
│  RẺ + NHANH, chạy hết 413 clip. CHỈ là gợi ý.       │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─ TẦNG 2: Hiểu ngữ nghĩa từng clip (Vision LLM) ─────┐
│  Lấy keyframe → Gemini Vision MÔ TẢ:                │
│   • Đang xảy ra gì? (bắn / né / tạo dáng / di chuyển)│
│   • Có phải khoảnh khắc đắt? (trúng đạn / phản ứng)  │
│   • Blur này CHẤP NHẬN ĐƯỢC không? (action vs lỗi)  │
│   • Cảm xúc / tông cảnh                              │
│  → "Hiểu biết về clip" có Ý NGHĨA, không chỉ số      │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─ TẦNG 3: Hiểu TỔNG video (LLM tổng hợp) ────────────┐
│  Gộp hiểu biết mọi clip → BẢN ĐỒ video:             │
│   • Câu chuyện tổng thể là gì?                       │
│   • Khoảnh khắc cao trào nằm đâu?                    │
│   • Cấu trúc tự nhiên (mở → dồn → cao trào → kết)    │
│   • Clip nào trùng / bỏ được                         │
│  → Như "ghi chú của editor" sau khi xem hết footage  │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─ TẦNG 4: Kế hoạch edit (LLM + ý muốn người dùng) ───┐
│  Bản đồ video + mục tiêu bạn chọn → KẾ HOẠCH:       │
│   • Mỗi quyết định CÓ LÝ DO tham chiếu nội dung      │
│     ("giữ clip 47 vì là cú trúng đạn quyết định")   │
│   • Đánh dấu quyết định rủi ro để bạn duyệt          │
│   • Edit như người, không như máy                    │
└──────────────────────┬──────────────────────────────┘
                       ▼
        ┌─ THỰC THI AN TOÀN (xem mục 3) ─┐
        │  Không phá hủy · Xem trước ·     │
        │  Undo được · Checkpoint          │
        └─────────────────────────────────┘
```

**Điểm mấu chốt**: Module KHÔNG còn là "luật cứng". Module là **năng lực**
mà AI dùng SAU KHI đã hiểu. AI quyết định _clip nào, vì sao_; cơ học chỉ
_thực thi an toàn_.

---

## 3. Mô hình AN TOÀN — vì sao KHÔNG THỂ hỏng file

Lo "hỏng file, hỏng nội dung" được giải quyết bằng thiết kế:

| Nguyên tắc                    | Cách đảm bảo                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| **Không đụng file gốc**       | Plugin chỉ sửa SEQUENCE (timeline references). File .mp4 thô KHÔNG bao giờ bị ghi đè/xoá.           |
| **Thao tác không phá hủy**    | Dùng `disable` (không xoá), `trim` (chỉ đổi in/out — source nguyên vẹn), `move`. Không hard-delete. |
| **Checkpoint trước khi chạy** | Snapshot sequence (đã có checkpoint store P4.06) → hoàn tác cả pipeline 1 nút.                      |
| **Xem trước bắt buộc**        | AI trình bày HIỂU BIẾT + kế hoạch + lý do → bạn duyệt trước khi ghi.                                |
| **Undo từng bước**            | `executeTransaction` = 1 undo step/thao tác (Ctrl+Z chuẩn Premiere).                                |
| **Chế độ báo cáo**            | Mọi module chạy được ở chế độ "chỉ phân tích, không ghi" để bạn xem AI nghĩ gì trước.               |

→ Tệ nhất: bạn Ctrl+Z hoặc khôi phục checkpoint. File gốc luôn an toàn.

---

## 4. Module được định nghĩa lại (AI-first)

Trước (nguy hiểm):

```
Module "Lọc clip kém" = tắt mọi clip composite < 0.40
```

Sau (AI hiểu):

```
Module "Lọc clip kém" =
  1. Tín hiệu thô: chấm blur/sáng (gợi ý ứng viên)
  2. Vision LLM XEM các ứng viên: "clip này mờ do action hay do lỗi?"
  3. AI quyết định: chỉ tắt clip THỰC SỰ hỏng (rung tay, lia trượt,
     che ống kính) — GIỮ clip mờ-do-action
  4. Trình bày: "Đề xuất tắt 18 clip (rung/trượt). GIỮ 12 clip mờ vì
     là khoảnh khắc bắn." → bạn duyệt
  5. Thực thi an toàn (disable, undo được)
```

Mỗi module có 3 thành phần:

- **Signals** (Python CV) — gợi ý rẻ.
- **Judgment** (Vision/LLM) — hiểu + quyết định.
- **Execute** (adapter) — thực thi an toàn.

---

## 5. Luồng hoàn chỉnh cho 1 video Nerf

```
Bạn: thả 413 file thô vào timeline → chọn mục tiêu "Highlight Nerf 2 phút"

1. AI quét tín hiệu thô (motion/blur/màu)            ~30s
2. AI gom cụm, chọn ~60 clip đại diện gửi Vision      (tiết kiệm cost)
3. Gemini Vision XEM 60 clip → mô tả nội dung          ~1-2 phút
4. AI dựng BẢN ĐỒ video: "Có 3 trận đấu, 14 cú trúng
   đạn, 8 pha né đẹp, 20 clip setup nhàm"
5. AI lập KẾ HOẠCH: giữ 14 cú trúng + 8 pha né, cắt
   setup, sắp theo cao trào, đề xuất nhạc theo nhịp
6. Trình bày kế hoạch + LÝ DO từng clip                → BẠN DUYỆT
7. Checkpoint → thực thi (disable/trim/move/transition)
8. Bạn xem kết quả, Ctrl+Z nếu chưa ưng, hoặc tinh chỉnh
```

---

## 6. Khả thi + chi phí (trung thực)

| Hạng mục              | Khả thi                      | Lưu ý                                                                               |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| Tín hiệu thô (Tầng 1) | ✅ Có sẵn                    | frame_sampler + quality + motion + color                                            |
| Vision LLM (Tầng 2)   | ✅ Gemini 2.5 đa phương thức | Gemini nhận ảnh — ta đã dùng                                                        |
| Hiểu tổng (Tầng 3)    | ✅ LLM văn bản               | Gộp mô tả → bản đồ                                                                  |
| Kế hoạch (Tầng 4)     | ✅ Đã có executor            | Nâng prompt + đưa hiểu biết vào                                                     |
| Thực thi an toàn      | ✅ Track A xong              | disable/trim/move ghi được                                                          |
| **Chi phí Vision**    | ⚠️ Cần khéo                  | 413 clip × ảnh = tốn API. Chiến lược: CV lọc trước → chỉ gửi ~60-100 frame đại diện |
| **Thời gian**         | ⚠️ 2-4 phút/video            | Vision LLM chậm hơn CV; chạy nền + báo tiến độ                                      |

**Chiến lược tiết kiệm cost** (quan trọng):

1. CV rẻ chạy hết 413 clip → cho điểm sơ bộ.
2. Gom cụm clip giống nhau → chỉ gửi 1 đại diện/cụm cho Vision.
3. Ưu tiên gửi clip "nghi ngờ" (điểm ranh giới) cho Vision phân xử.
4. Cache hiểu biết theo hash file → lần sau khỏi gửi lại.

---

## 7. Kế hoạch nâng cấp (cập nhật theo hướng AI-first)

| GĐ        | Việc                                                                     | Ghi chú                  |
| --------- | ------------------------------------------------------------------------ | ------------------------ |
| **AI-1**  | Vision pipeline: sample keyframe → Gemini Vision → "clip understanding"  | Tầng 2                   |
| **AI-2**  | Aggregator: gộp understanding → "video map" (Tầng 3)                     |                          |
| **AI-3**  | Editorial planner: video map + mục tiêu → kế hoạch có lý do (Tầng 4)     | nâng director prompt     |
| **AI-4**  | Safety: checkpoint tự động + chế độ preview + báo cáo trước ghi          | dùng checkpoint store    |
| **AI-5**  | Cost optimizer: cụm hoá + cache hiểu biết theo file hash                 |                          |
| **MOD-x** | Module (checklist) reframe: mỗi module = signals + AI judgment + execute | gộp với module-system.md |

---

## 8. Kết luận

Bạn đúng: **plugin không nên là "máy chạy luật cứng" mà là "trợ lý editor
biết xem và hiểu".** Hai thứ kết hợp:

- **Cơ học** lo _thực thi an toàn_ (không hỏng file).
- **AI** lo _hiểu nội dung + quyết định như người_ (không hỏng nội dung).

Module checklist vẫn giữ — nhưng mỗi module giờ có "bộ não" AI bên trong,
không chỉ ngưỡng số. Đây là hướng đúng để plugin dùng được THẬT cho video
Nerf mà không phá hỏng những khoảnh khắc đắt giá.

# Teardown: SADESIGN RETOUCH PRO v5.3 (Photoshop) → tinh túy cho DirectorAI

> Mục tiêu: mổ xẻ một plugin thương mại đang bán chạy (retouch ảnh chân dung
> cho Photoshop) để rút **bài học UI/UX + kiến trúc** áp dụng cho DirectorAI
> (plugin AI dựng video Nerf cho Premiere). KHÔNG sao chép code (code của họ
> bị obfuscate có chủ đích — tôn trọng IP); chỉ học **ý tưởng & cách bố trí**.

Thư mục: `%APPDATA%\Adobe\CEP\extensions\SADESIGN.RETOUCHING.PRO.V5.3`

---

## 1. Tech stack (đối chiếu với DirectorAI)

| Hạng mục     | SADESIGN                                            | DirectorAI (của ta)                      |
| ------------ | --------------------------------------------------- | ---------------------------------------- |
| Runtime      | **CEP 6.0** (Chromium nhúng cũ)                     | **UXP** (apiVersion 2 — đời mới)         |
| Host         | Photoshop 18.2+ (`PHXS/PHSP`)                       | Premiere 26 (`premierepro`)              |
| UI framework | jQuery 1.9.1 + jQuery-UI 1.9.2 (2013)               | React 18 + TS (hiện đại)                 |
| Cầu nối host | `CSInterface.js` + `evalScript`                     | UXP `require('premierepro')` + WS server |
| Logic xử lý  | **268 file `.jsx` JSXBIN** (ExtendScript biên dịch) | TS adapter + Python sidecar (Gemini/CV)  |
| Bảo vệ code  | JSXBIN + JS obfuscator (`_0x3cf5` string-array)     | (chưa) — mã nguồn mở nội bộ              |
| Node.js      | Bật (`--enable-nodejs --mixed-context`)             | Node ở server riêng (process tách biệt)  |

**Kết luận stack:** ta đang ở thế hệ công nghệ **mới hơn 1 bậc** (UXP+React vs
CEP+jQuery). Nghĩa là họ thắng ta KHÔNG nhờ công nghệ — mà nhờ **UX dày dạn +
độ phủ tính năng + nhịp thao tác**. Đó mới là thứ cần học.

---

## 2. Giao diện — vì sao "cảm giác tốt"

### 2.1 Kích thước & mật độ

- Panel **cố định 280×710** (`MinSize=MaxSize` width 280, height 710 khóa
  cứng). → Bố cục luôn đoán trước được, không vỡ layout. Không cho người dùng
  kéo méo. _(Trade-off: kém linh hoạt, nhưng đổi lại ổn định tuyệt đối.)_
- Lưới nút **3 cột**, nút `4em × 2em`, `margin 0.1em` → **rất dày, rất gọn**.
  1 màn hình nhồi được ~40–50 hành động mà không thấy rối, nhờ **gom nhóm có
  tiêu đề** (RETOUCH TỰ ĐỘNG / MAKEUP & HAIR / DODGE & BURN / XỬ LÝ NÂNG CAO).
- Font Tahoma 11px — nhỏ nhưng đặc, đúng "gu công cụ pro".

### 2.2 Hệ thống Tab 2 tầng (điểm hay nhất về điều hướng)

- Hàng icon trên cùng = **6 nhóm lớn** (Tab 1..6).
- Mỗi tab có **2 lớp con**: `1A – CHUYÊN NGHIỆP` ⇄ `1B – ĐỈNH CAO` (toggle).
  → Người mới ở lớp A; người pro lật sang lớp B lấy công cụ sâu hơn. **Cùng
  một không gian, 2 độ sâu** — không làm ngợp người mới mà vẫn chiều cao thủ.
- Khối ẩn/hiện theo `#block-1a / #block-1b ... #block-7a` (CSS state).

### 2.3 Theming đồng bộ host (chi tiết tinh tế)

- 4 theme: `light / dark / superlight / superdark` + `styles.css` (cấu trúc)
  tách khỏi màu. Link `#theme` được **đổi runtime** để khớp độ sáng UI của
  Photoshop → panel "dính liền" với host, không lạc tông.
- Accent hover `#00a6ff` (cyan) nhất quán toàn bộ; nền `#0d2529`/`#333`,
  nút `#1c3c4b`→`#225268` (xanh đậm 2 sắc độ phân biệt nút thường/nút nhóm B).

### 2.4 Nút có "trọng lượng" thị giác

- Mỗi nút có `linear-gradient` highlight trên + shadow dưới (giả nổi khối) +
  `text-shadow` → cảm giác bấm được, "đầm tay". Rẻ về kỹ thuật, đắt về cảm giác.

---

## 3. Tính năng (đọc từ nhãn nút — độ phủ là vũ khí chính)

Nhóm tính năng họ bán:

- **Retouch da tự động nhiều cấp**: Mịn Da AI, Mịn Đỉnh Cao, Mịn Đỉnh Cao +,
  Da Hoàn Hảo, Da Tàn Nhang, Min Da PRO, Đều Da, Xóa Mụn AI, Đánh Khối AI.
- **Tạo dáng / khuôn mặt**: Thon Mặt, Cằm VLine, Mũi thon, To mắt, Dáng thon,
  Min + Thon.
- **Makeup & Hair**: MakeUp Mắt, Mặt & Môi, Tô Son, Trắng Răng, Trắng da, Khử đỏ.
- **Dodge & Burn / ánh sáng**: Dodge & Burn AI, Softlight, Kích nét, Kích nét AI,
  Highpass, Trong ảnh, Trong Sáng AI/AI 2, Miệng cười.
- **Xử lý nâng cao**: Đóng Logo, Lọc ảnh, Thay mây, Đều Phông, Tách nền, Ủi Đồ,
  Gộp Layer, Color SaDesign.
- **Tự Động Hàng Loạt** (xem mục 4) — quân bài chiến lược.
- **Preset / Dịch vụ / Social Network / Hướng dẫn / Bản quyền (đếm ngày)** ở
  chân panel.

→ **Bài học độ phủ:** họ không có "1 nút thần kỳ". Họ có **~60 hành động nhỏ,
đặt tên theo NGÔN NGỮ NGƯỜI DÙNG** ("Trắng Răng", "VLine", "Thay mây") chứ
không theo thuật ngữ kỹ thuật. Người dùng thấy đúng từ mình nghĩ → bấm ngay.

---

## 4. "Tự Động Hàng Loạt" — tính năng người dùng KHEN (mổ kỹ)

Đây là cửa sổ rời (screenshot 2). Cấu trúc:

1. **Chọn thư mục vào & ra**:
   - "Xử lý các file từ Folder" (checkbox bật chế độ batch)
   - "Thư mục chứa ảnh gốc" + nút **Duyệt**
   - "Thư mục lưu ảnh đã hoàn thành" + nút **Duyệt**
   - Tùy chọn: Xử lý thư mục con / Đổi tên `<Tên file gốc>_Edited` / Ghi đè /
     "Lưu và đóng file" / Định dạng đầu vào (TẤT CẢ / JPG / PNG…).
2. **Chọn chức năng + mức độ áp dụng** (danh sách checkbox, mỗi dòng có
   **slider cường độ** + nhãn mức `Trung bình` / `50%`): Thon mặt, Cằm VLine,
   Mũi thon, To mắt, Dáng thon, Mịn da, Mịn da PRO, Mịn đỉnh cao (+), Xóa mụn
   AI, Đánh khối AI, Trong sáng AI/AI 2, Tăng nét, Lưu Facebook (2048px)…
3. **Cài đặt ảnh đầu ra**: JPG (chất lượng 1–12) / PSD / PNG / TIFF (nén LZW).
4. Nút **Thực hiện** / **Hủy**.

### Vì sao nó "rất tốt" (và đây là điều ta phải bê nguyên _triết lý_):

- **Một nơi cấu hình → chạy cả folder**: chọn input/output 1 lần, tick nhiều
  hiệu ứng, mỗi hiệu ứng có **cường độ riêng**, rồi "Thực hiện". Khớp 100% với
  triết lý ta vừa làm cho DirectorAI (D4: chọn thư mục gốc 1 lần → auto).
- **Cường độ rời cho từng chức năng** (slider + preset Nhẹ/TB/Mạnh) → người
  dùng kiểm soát "đậm/nhạt" mà không cần hiểu tham số bên trong.
- **Đặt tên file & định dạng đầu ra rõ ràng** → an toàn (không ghi đè trừ khi
  chủ động tick), dễ đối chiếu trước/sau.
- **Gộp 'chọn việc' + 'mức độ' + 'I/O' trong 1 hộp thoại** thay vì bắt đi 3 nơi.

---

## 5. Các VẤN ĐỀ (điểm yếu — để ta KHÔNG lặp lại)

| #   | Vấn đề                                                              | Hệ quả                                      | Ta tránh thế nào                                                                                |
| --- | ------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P1  | **index.html nặng 78.7 MB** (toàn JS obfuscate inline, 0 ảnh nhúng) | Cold-start chậm, ngốn RAM CEF, khó debug    | React + webpack code-split; bundle ta ~vài trăm KB. Giữ ngân sách cold-start <2s (đã có P4.14). |
| P2  | **jQuery 1.9 + CEP** (2013, EOL)                                    | Bảo mật/bảo trì kém, Adobe đang khai tử CEP | Ta đã ở UXP+React (đúng hướng)                                                                  |
| P3  | **Panel khóa cứng 280×710**                                         | Không responsive, màn nhỏ bị cắt            | Ta dùng layout co giãn + scroll                                                                 |
| P4  | **~60 nút phẳng, không tìm kiếm**                                   | Người mới lạc; phải nhớ nút nằm đâu         | Thêm ô **tìm nhanh hành động** + nhóm gập                                                       |
| P5  | **Không có Undo gộp / xem trước** (bấm là chạy thẳng lên ảnh)       | Sai là phải Ctrl-Z tay, rủi ro              | Ta có **checkpoint + preview + approval gate** (SAFE-1/2) — đây là lợi thế lớn của ta           |
| P6  | **Tên file phụ thuộc người dùng tick "Ghi đè"**                     | Dễ mất ảnh gốc nếu lỡ tay                   | Ta mặc định **không phá hủy** (ghi ra bản mới)                                                  |
| P7  | **Cường độ là số khô ("50%", "Trung bình")**                        | Không cho biết _kết quả_ sẽ ra sao          | Ta có thể kèm **mô tả AI** ("cắt gọn highlight động")                                           |
| P8  | **Phụ thuộc nút bấm tay 100%**                                      | Không có "hiểu nội dung rồi tự đề xuất"     | Ta có **AI hiểu clip → tự đề xuất kế hoạch** (AI-1/2/3)                                         |

---

## 6. TINH TÚY rút ra → việc làm cho DirectorAI

Xếp theo **độ đáng làm** (giá trị ÷ công sức). Mỗi mục map sang phase.

### ⭐ Hạng A — bê ngay (giá trị cao, công sức thấp)

- **A1. Hộp thoại "Chạy hàng loạt" hợp nhất** (giống "Tự Động Hàng Loạt").
  Gộp vào AutoTab: [thư mục gốc đã quét] → [danh sách module có **slider cường
  độ + preset Nhẹ/TB/Mạnh**] → [định dạng/đặt tên đầu ra] → [Xem trước][Thực hiện]. Ta đã có 80% (D2/D3/D4 + module checklist); chỉ **thêm slider cường độ
  per-module + khối Output**.
- **A2. Đặt tên hành động theo NGÔN NGỮ NGƯỜI DÙNG.** Rà lại nhãn module/nút:
  "cut khoảnh khắc bắn" thay vì "trim by beat"; "ghép cảnh mượt" thay vì
  "transition". (Nerf-domain wording.)
- **A3. Nhóm có tiêu đề + theme đồng bộ host.** AutoTab chia nhóm rõ ("CẮT &
  NHỊP", "MÀU & ÁNH SÁNG", "DỌN CLIP XẤU"); đồng bộ sáng/tối theo Premiere.
- **A4. Preset cường độ rời cho từng module** (Nhẹ/Vừa/Mạnh = 1 con số 0–100)
  → đẩy xuống `intensity` trong plan params. Rẻ, người dùng thích.

### ⭐ Hạng B — nên làm (giá trị cao, công sức vừa)

- **B1. Ô "Tìm nhanh hành động"** (filter module theo từ khóa) — chữa P4.
- **B2. Hai lớp độ sâu "Cơ bản / Nâng cao"** như tab A/B của họ — người mới
  thấy 6 module chính; pro mở "Nâng cao" thấy tham số chi tiết.
- **B3. Thanh "Bản quyền: còn N ngày" + Hướng dẫn + Dịch vụ ở chân panel** —
  ta đã có license (P4.17); chỉ cần **hiện số ngày còn lại** cho minh bạch.
- **B4. Nút "Duyệt thư mục" gốc OS** thay vì dán path — D4 đã quét, nên thêm
  nút mở dialog chọn folder (UXP `getFolder`) cho khớp trải nghiệm "Duyệt".

### ⭐ Hạng C — lợi thế ta vượt họ (đẩy mạnh để khác biệt)

- **C1. Xem trước + Undo gộp + Approval** (họ KHÔNG có) → marketing đúng điểm
  đau: "AI sửa nhưng bạn duyệt trước, sai 1 nút hoàn tác sạch".
- **C2. AI hiểu nội dung → tự đề xuất** (họ chỉ bấm tay) → "không cần biết bấm
  nút nào, AI tự đọc clip Nerf và đề xuất bản cắt".
- **C3. Báo cáo chất lượng** (đã có MOD-5) → "chấm điểm từng clip, loại clip mờ/
  rung tự động".

---

## 7. Đề xuất phase tiếp theo (chuỗi E — "Batch UX parity")

| Phase  | Việc                                                                               | Map tinh túy | Ước lượng |
| ------ | ---------------------------------------------------------------------------------- | ------------ | --------- |
| **E1** | AutoTab: slider cường độ + preset Nhẹ/TB/Mạnh per-module → `intensity`             | A4           | nhỏ       |
| **E2** | Khối "Đầu ra" (đặt tên/định dạng/không phá hủy) + nút Duyệt folder (UXP getFolder) | A1,B4,P6     | vừa       |
| **E3** | Gom nhóm có tiêu đề + ô tìm nhanh hành động                                        | A3,B1        | nhỏ       |
| **E4** | Lớp "Cơ bản/Nâng cao" + đồng bộ theme host                                         | B2,A3        | vừa       |
| **E5** | Chân panel: bản quyền còn N ngày + Hướng dẫn + Dịch vụ                             | B3           | nhỏ       |
| **E6** | Đặt lại tên module theo ngôn ngữ Nerf-domain                                       | A2           | nhỏ       |

> Triết lý chốt: **họ thắng bằng "một nơi cấu hình → chạy cả lô, có cường độ".**
> Ta đã có nền tảng đó (D4 + module) CỘNG ba thứ họ thiếu (xem trước, undo gộp,
> AI tự đề xuất). Làm xong chuỗi E là ta **ngang về nhịp thao tác và vượt về
> an toàn + thông minh.**

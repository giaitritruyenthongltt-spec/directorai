# Cơ chế Auto-Connect: Plugin ↔ Sequence ↔ File (phân tích sâu)

> Phản hồi đúng của người dùng: "mở sequence → mở plugin thì plugin phải TỰ
> kết nối sequence đang hiển thị + TỰ lấy đường dẫn thư mục file (video/music/
> hiệu ứng ở nhiều folder khác nhau). Nhập path tay là SAI quy trình. Plugin
> phải điều khiển được timeline."

## 1. Vì sao bản hiện tại bắt nhập path tay (lỗi thiết kế)

AutoTab yêu cầu dán `clipPaths` vì giả định **Premiere 26 không lộ đường dẫn
file của clip timeline cho plugin**. Đây là giả định CẦN kiểm chứng lại —
nếu sai thì cả luồng nhập tay là thừa.

## 2. Cơ chế ĐÚNG (3 lớp)

```
┌─ Premiere (host) ──────────────────────────────────────────┐
│  ProjectItem (media bin)  ──getMediaFilePath()──► path tuyệt đối │
│        ▲ getProjectItem()                                       │
│  TrackItem (clip trên timeline) ── thuộc ── Sequence (active)   │
└────────────────────────────────────────────────────────────────┘
        ▲ require('premierepro') trong UXP
┌─ Panel (UXP) ─ UXPPremiereAdapter chạy Ở ĐÂY ─────────────────┐
│  getActiveSequence() → listClips() → mỗi clip:                 │
│     name + source.path (từ getMediaFilePath) + in/out + track  │
└────────────────────────────────────────────────────────────────┘
        ▲ WS :7778 (server gọi panelCall)
┌─ Server ─ composite (safe.*, context.*) ─────────────────────┐
│  KHÔNG cần người dùng nhập gì: tự lấy clip từ active sequence  │
└────────────────────────────────────────────────────────────────┘
```

**Nguyên tắc**: Plugin (panel) chạy UXP adapter, có `require('premierepro')`,
nên TỰ truy cập active sequence + project items + đường dẫn media. Người dùng
KHÔNG nhập gì — chỉ mở sequence rồi bấm Run.

## 3. Lấy đường dẫn file (mấu chốt kỹ thuật)

`translateTrackItem` (uxp-translate.ts) đã thử 6 accessor:
`getMediaFilePath / getMediaPath / getFilePath / mediaFilePath / filePath /
path`, CHỈ nhận chuỗi có dấu phân cách (`/` hoặc `\`), không thì rơi về tên.

→ Hiện `source.path` = basename ("0530.mp4") nghĩa là **các accessor trả về
basename hoặc rỗng**. CẦN chẩn đoán giá trị RAW (đã thêm vào `_debug.introspect`:
`path_getMediaFilePath`, `path_getMediaPath`, …) để biết:

- (A) Nếu 1 accessor trả path tuyệt đối → BUG ở chỗ lọc/await → sửa là xong,
  plugin tự lấy path đầy đủ.
- (B) Nếu TẤT CẢ chỉ trả basename → Premiere 26 thật sự ẩn path. Khi đó giải
  pháp: (b1) hỏi user 1 lần các **thư mục gốc** (video/music/fx) rồi map
  basename→full bằng quét thư mục; (b2) hoặc dùng `Project` metadata khác.

## 4. Điều khiển timeline (đã có, cần nối UI)

Adapter ĐÃ điều khiển timeline được (verified): disable/trim/move/rename +
transition/color (C2/C3). Việc còn thiếu: UI **tự nạp clip** thay vì nhập tay.

## 5. Việc cần làm

| #   | Việc                                                                       | Trạng thái          |
| --- | -------------------------------------------------------------------------- | ------------------- |
| D1  | Chẩn đoán raw path (introspect) → biết (A) hay (B)                         | đã thêm, cần reload |
| D2  | Composite `context.activeSequenceClips` → trả clip + path từ active seq    | làm                 |
| D3  | AutoTab/AnalysisTab TỰ nạp clip khi mở (bỏ nhập tay; giữ ô làm "nâng cao") | làm                 |
| D4  | Nếu (B): UI chọn **thư mục gốc** (nhiều folder) → map basename→full        | tuỳ kết quả D1      |
| D5  | Sửa StatusBar "Mock Project" (panel tự-hỏi-mình rơi mock)                  | làm                 |

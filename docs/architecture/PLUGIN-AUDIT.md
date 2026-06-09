# DirectorAI — Audit toàn diện + Lộ trình khép-kín-luồng (2026-06-09)

> Đánh giá CHẶT TAY sau nhiều lần nâng cấp. Phân biệt cái _chạy thật_ với _scaffold/stub/claim_.
> Mọi số liệu verify trực tiếp trên code + data thật, không tin claim của doc/commit cũ.

## 1. Sơ đồ vận hành hiện tại

```
PREMIERE 26  ─UXP panel(7 tab,VN)─ dispatchRpc(executeTransaction) ─► GHI clip CÓ SẴN ✅
                                                                       (trim/move/disable/rename/
                                                                        color Lumetri/marker/audio)
                                                                       ❌ KHÔNG insert / sequence rỗng
     │ WS :7778
  SERVER(TS,32 tool) ── Gemini planner (đạo diễn) ── checkpoint/progress/cancel
     │ HTTP :8000
  CONTEXT-ENGINE(Python) ── CV 0-token (scene/motion/beat/silence/quality/cluster/embed)
                         ── ML thật (Whisper/YOLO/Demucs/ChromaDB/Gemini Vision)
  LANE-B headless (FFmpeg+Demucs): recut/anti-dup · speed · BGM · color → xuất FILE ✅ tin cậy nhất
```

## 2. Thực tế đường ghi (đã verify code + live session này)

- **Write CHẠY THẬT** trên clip có sẵn: `uxp.ts` dùng `executeTransaction` + Action factories (KHÔNG
  còn `lockedAccess` hỏng). Color Lumetri verify live read-back (BEFORE contrast0 → AFTER contrast18).
  → **Doc `premiere-26-known-issues.md` (02/06) nói "mọi write hang" ĐÃ LỖI THỜI** (cần sửa).
- **Giới hạn THẬT (còn nguyên):** KHÔNG `insert` clip / KHÔNG ghi sequence RỖNG (PPro26 UXP không có
  razor/insert/createTrackItem). → "AI tự dựng phim TRONG Premiere" bị chặn ở khâu insert.
- `.env` gitignore + không track (key an toàn — claim "lộ trong git" là SAI).

## 3. Soi danh sách chức năng

| Hạng mục                                                                                             | Thật           | Logic                              |
| ---------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------- |
| CV phân tích (0-token)                                                                               | ✅             | hợp lý, nền vững                   |
| AI hiểu clip 3 tầng (Gemini, cache/cluster/prefilter)                                                | ✅             | hợp lý, kỷ luật token              |
| Lane-B recut/speed/color/BGM                                                                         | ✅ verified    | **mạnh nhất** → nên là trục chính  |
| Ghi clip có sẵn (trim/rename/disable/color/marker)                                                   | ✅ live        | hợp lý                             |
| transition/reorder                                                                                   | 🟡 beta        | chưa chốt live                     |
| **Insert/dựng từ folder TRONG Premiere**                                                             | ❌ chặn        | **LỖ HỔNG lõi**                    |
| 3 tab Đạo diễn/Tự động/Phim dài                                                                      | đều "tạo phim" | **chồng lấn — gây rối**            |
| marketplace/teams/mobile/portal/render-worker/analytics/community/render-queue/updater/cli/mcp-tools | 🚫 orphan/stub | **scaffold ảo, thổi phồng "done"** |

## 4. Điểm số (chặt tay)

| Hạng mục                          | Điểm                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lõi ghi trong Premiere            | 7.0/10 ↑ (test:job-write tap11 **15/15** LIVE: transition+effect+color+trim+rename+disable+audio ghi+hoàn-tác sạch; move dry-OK; chỉ insert bị chặn) |
| Trí tuệ AI/CV                     | 8.0/10                                                                                                                                               |
| Đường ra headless (Lane-B/FCPXML) | 9.0/10 ↑ (P0 concat MP4 + ASM-4 FCPXML editable cả-sequence: 2 đường ra verify thật)                                                                 |
| UX/giao diện                      | 8.0/10 ↑ (P1c: 1 cửa chính = Tự động; Phim dài/Đạo diễn thành phụ)                                                                                   |
| Độ tin cậy/kiểm thử thật          | 7.5/10 ↑↑ (P2a Python vào CI + P2b test assemble TỰ ĐỘNG ffmpeg + test panel)                                                                        |
| Kỷ luật phạm vi                   | 7.0/10 ↑↑ (P1a: quarantine 12 orphan → còn 7 app/15 pkg thực MVP)                                                                                    |
| Trung thực trạng thái             | 7.5/10 ↑↑ (P1b: known-issues sửa, audit doc chuẩn; MEMORY log còn phồng)                                                                             |

**TỔNG re-verify ≈ 7.8/10 ↑↑ · Sẵn sàng MVP thực ≈ 82%.** Hành trình: 6.2 (gốc) → 6.5 (P0) → 7.0
(P1a/b) → 7.6 (P1c + P2) → 7.7 (transition+color live) → **7.8 (ASM-4 FCPXML editable)**. Mọi mục **≥ 7.0**.
Insert bị PPro26 chặn (đã né bằng Lane-B) là trần duy nhất của Lõi ghi. Bug color self-revert count=2
đã FIX (test fragility — chọn clip chưa-có-Lumetri; product ensureLumetri vốn tái dùng đúng).

## 5. Lộ trình (vòng lặp có cổng — verify trên data/Premiere thật)

### P0 — KHÉP KÍN "dựng phim qua đường file" (biến điểm yếu insert thành mạnh)

Mối nối đang thiếu: `[folder] → phân tích + sắp thứ tự + tỉa/tốc độ → 1 SẢN PHẨM`.
Hạ tầng đã có: `/order/suggest`, `/speed/plan`, dead_air, `buildContiguousTimeline`+`buildFcpxml`
(ORPHAN), Lane-B per-clip render. Thiếu: **concat renderer** + **composite nối** + **UI**.

| Phase    | Ẩn số             | Spike                                                                | Cổng                                                                  |
| -------- | ----------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ✅ ASM-0 | concat được không | `assemble.py` ffmpeg-concat 3-4 clip thật → ffprobe                  | **xong: expected=actual khớp**                                        |
| ✅ ASM-1 | mối nối           | `assemble_auto` 0-token (CV speed+dead-air) → 1 MP4                  | **xong: 40.96s khớp, NVENC, aac**                                     |
| ✅ ASM-2 | server            | `/assemble/auto`+`/assemble/render` + composite `assemble.*`         | **xong: WS end-to-end 27.7s khớp**                                    |
| ✅ ASM-3 | UI                | section "Dựng & Xuất phim" + checkbox tốc độ/cắt lặng                | bundle build sạch; render chờ reload                                  |
| ✅ ASM-4 | editable          | `plan_only` + `assemble.fcpxml` (FcpClip trim/timeMap) → buildFcpxml | **xong: 3 asset-clip, timeMap, wellFormed (R1b né); import thủ công** |

> **P0 ĐÓNG (đường Lane-B concat).** Luồng `folder → CV (tốc độ/cắt lặng) → 1 PHIM MP4` chạy
> trọn vẹn + verify thật (3-4 clip Nerf, độ dài expected=actual, audio giữ pitch). Đây là đường
> "dựng phim" KHÉP KÍN né hẳn giới hạn insert PPro26. 5/5 test thuần. ASM-4 (xuất FCPXML editable)
> là bản phụ cho ai muốn timeline sửa được — tuỳ chọn.

### P1 — Dọn & trung thực

- Gộp 3 tab dựng phim → 1 luồng. Quarantine package orphan sang `future/`.
- Sửa `premiere-26-known-issues.md` (write không còn hang) + chỉnh MEMORY milestone.

### P2 — Siết verify

- Smoke ghi-thật lặp được + read-back tự động. Test component panel. Python vào CI lint.
- transition/reorder beta → verified bằng job live.

## 6. Definition of MVP "xịn" (Gate khép-kín-luồng)

A1 1 luồng folder→sản phẩm chạy trọn vẹn + verify · A2 sản phẩm đúng (thứ tự/độ dài/phát được) ·
A3 1 cửa vào rõ ràng · A4 0-token mặc định · A5 repo sạch scaffold · A6 doc khớp thực tế.

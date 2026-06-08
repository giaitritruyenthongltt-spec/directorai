# Điều chỉnh tốc độ từng cảnh (per-scene speed) — Plan v3 (loop-hardened)

> Tài liệu này được "tôi luyện" qua VÒNG LẶP build-test-refine. Mỗi giả định rủi ro
> được verify bằng spike trên DATA/PREMIERE THẬT trước khi build. Cập nhật khi có
> phát hiện mới.

## 0. Vòng lặp (bất biến)

Mọi giả định chưa-verify = 1 thẻ RỦI RO mở. Mỗi vòng: PICK rủi-ro cao nhất → SPIKE
trên data/Premiere thật → MEASURE vs tiêu chí → DECIDE (đóng/đổi cách/scope-out) →
PROPAGATE vào plan → RE-AUDIT. EXIT khi mọi Gate MVP xanh.

## 1. Công cụ AI/CV để QUYẾT tốc độ (đã verify có trong code)

| Tín hiệu                                                      | Nguồn                                  | Vai trò speed                                   |
| ------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| `motion_score` (mean inter-frame diff, 0-1)                   | `scene_class.py:_motion_score`         | đo động/tĩnh thật — gần "chính xác tốc độ" nhất |
| `action_level`/`is_key_moment`/`key_moment_type`/`scene_type` | `vision_understand.py` (Gemini, cache) | ngữ nghĩa: slow-mo pha "hit", tua cảnh static   |
| `tempo_bpm` + `beats_sec`                                     | `beat.py` (librosa)                    | đồng bộ nhịp nhạc                               |
| silence                                                       | `silences.py`                          | tua nhanh đoạn lặng                             |
| scene boundaries                                              | `scene.py`                             | chia shot                                       |
| fps                                                           | probe                                  | đánh giá slow-mo có mượt                        |

CHƯA có: optical-flow Farneback (vận tốc chính xác hơn) + frame-interpolation (slow-mo mượt <50fps) → nâng cấp P6.

## 2. ĐƯỜNG GHI — P0 SPIKE (đã test LIVE trên Premiere 26, 2026-06-08)

- ❌ **FCPXML auto-import (`project.importSequences`/`importFiles`)**: gọi từ panel → **HANG ~85s + KHÔNG tạo sequence** (modal/blocking). Không one-click được.
- ✅ **FCPXML xuất file**: `fcpxml.export` ra `~/.directorai/exports/*.fcpxml`; **timeMap retime ĐÚNG** (timeline 2s ↦ source 1s = 0.5x). Dùng cho "xuất → user File▸Import thủ công".
  - 🐞 R1b: producer xuất `width="undefined"` khi timeline thiếu width/height → **phải validate/default** (sửa khi build P-FCPXML).
- ❌ **Native setSpeed timeline (UXP)**: không có `createSetSpeedAction` (introspect) + ADR-0017 xác nhận. Bỏ.
- ✅ **Lane-B FFmpeg** (`recut_pipeline`): `setpts=PTS/speed` (video) + `atempo` (audio, **giữ pitch** → không méo giọng), clamp 0.5–2.0, NVENC→x264, atomic. **Headless, verified.**

### → QUYẾT: đường ghi MVP = **Lane-B per-clip re-render** (đóng R1/R2/R5).

FCPXML = đầu ra phụ (editable, user tự import). Native = loại.

## 3. Engine quyết tốc độ

Mỗi shot → tổng hợp tín hiệu → speed + reason + confidence:

- key_moment(hit/dodge) HOẶC motion/action cao → slow-mo (0.5–0.7×).
- static/establishing/silence/motion thấp → speed-up (1.3–2×).
- else 1.0×. Clamp 0.5–2.0. fps-gate: chặn/giới hạn slow-mo khi fps < ngưỡng.
- 4 mode: Theo nội dung · Chuẩn hoá chuyển động (speed=target/motion_đo) · Theo nhạc · Mục tiêu thời lượng.
- **Ngưỡng lấy từ PERCENTILE phân bố thật** (calibrate sub-loop), KHÔNG hardcode đoán.

## 4. Plan v3 theo phase (mỗi phase = 1 vòng có CỔNG)

| Phase   | Ẩn số     | Spike                                                                                        | Cổng PASS                      |
| ------- | --------- | -------------------------------------------------------------------------------------------- | ------------------------------ |
| ✅ P0   | đường ghi | FCPXML import live + introspect setSpeed                                                     | **xong: Lane-B**               |
| P1      | engine số | `speed_analyze.py` (motion+action+silence+fps) trên 10 clip → in phân bố                     | bảng số hợp lý                 |
| P2      | ngưỡng R3 | **calibrate** percentile + validate clip giữ-lại                                             | preview "nhìn đúng"            |
| P3      | apply     | nối speed/clip vào Lane-B batch (recipe.speed có sẵn) + R4 fps-gate                          | render đúng fps/độ dài (probe) |
| P4      | UI        | module "Điều chỉnh tốc độ" + ⚙️ (mode/độ slow-mo/min-max/thời-lượng) + bảng preview + Render | preview khớp output            |
| P5(phụ) | editable  | xuất FCPXML (sửa R1b width) cho ai muốn timeline retime                                      | import thủ công OK             |
| P6(sau) | precision | optical-flow + frame-interp                                                                  | slow-mo mượt                   |

## 5. Definition of MVP "xịn" (Gate)

G1 apply path verified (✅ Lane-B) · G2 audio không méo (✅ atempo) · G3 ngưỡng từ data ·
G4 fps-gate slow-mo · G5 preview khớp output · G6 chạy độc lập (không trộn trim/reorder) ·
G7 mặc định CV (0 token), Vision tuỳ chọn.

## 6. Risk register

R1 ✅đóng (FCPXML auto-import bỏ→Lane-B) · R1b 🟡 producer width undefined · R2 ✅đóng (atempo) ·
R3 🟡 ngưỡng-từ-data · R4 🟡 fps judder · R5 ✅đóng (native bỏ) · R6 🟢 xung đột module · R7 🟢 preview.

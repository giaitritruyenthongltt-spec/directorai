# Job test đầy đủ (live) — runbook

> Kiểm MỌI chức năng qua WS server thật (Premiere + sidecar + Gemini) trên
> sequence đang mở. Ghi thật timeline có TỰ HOÀN TÁC. `npm run test:job`.

## Chạy

1. Đảm bảo đang chạy: server `:7778`, sidecar `:8000`, panel kết nối Premiere với 1 sequence mở (vd "tap 11"). (`pnpm dev` / các script start-\*.)
2. `node tools/jobtest-tap11.mjs` (hoặc `npm run test:job`). Exit 0 = tất cả PASS.

## Bao phủ (20 test, 6 nhóm)

| Nhóm            | Test                                                                                 | Ý nghĩa                                                            |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| A. Đọc          | project.get · getActiveSequence · activeSequenceClips · resolveFromProject           | dự án/sequence/clip; kind video/audio đúng; map path               |
| B. CV/audio     | qualityReport · planDeadAir · detectBeats · clusterClips · listEffects · module.list | phân tích KHÔNG cần Gemini                                         |
| C. AI           | understandClip · buildVideoMap · buildEditPlan(3 hồi)                                | Gemini hiểu clip → bản đồ → kế hoạch (rename/trim/move/transition) |
| D. An toàn      | previewPlan · applyPlan DRY-RUN                                                      | mọi action execution-ready, KHÔNG mutate                           |
| **E. GHI THẬT** | checkpoint.snapshot → rename → verify(đếm tên) → hoàn tác → verify                   | **đường ghi timeline + project về nguyên trạng**                   |
| F. Hệ thống     | checkpoint.list · marker.list(soft)                                                  | liveness                                                           |

## Kết quả tham chiếu (tap 11, 413 clip — 2026-06-05)

```
KẾT QUẢ: 20/20 PASS
A: total=413 kind={video:207, audio:206} · resolved=171 video
C: buildEditPlan steps=15 actions={rename:5,trim:5,move:4,transition:1}
D: previewPlan executable=15/15 · dryRun sẽ-ghi=15
E: rename applied=1 → "clip mang tên mới=1 (video)" → hoàn tác "còn 0 clip tên test"
   → Ghi timeline: rename=OK · hoàn tác=OK
```

## Lưu ý cách VERIFY rename (quan trọng)

Synthetic clip id chứa TÊN (`<track>:<tick>:<name>`) → **id ĐỔI sau rename**.
KHÔNG verify theo id cũ (sẽ "undefined"). Verify ĐÚNG = **đếm số clip mang tên
mới** (rename OK ⇔ đúng 1; hoàn tác OK ⇔ còn 0). Cũng KHÔNG đối chiếu theo
path/name cũ vì có thể trùng nhiều clip (video+audio cùng basename).

## C10 — Bộ GHI THẬT self-revert đầy đủ (`npm run test:job-write`)

`tools/jobtest-write-tap11.mjs` — ghi THẬT 4 thao tác an toàn rồi TỰ HOÀN TÁC,
cuối cùng đối chiếu "vân tay" toàn timeline (tên/kind/enabled/in-out/start, làm
tròn 2 số lẻ) để chắc project về NGUYÊN TRẠNG.

| Test           | Ghi thật                             | Verify               | Hoàn tác                  |
| -------------- | ------------------------------------ | -------------------- | ------------------------- |
| rename         | đổi tên → tên test                   | đếm tên mới = 1      | đổi lại (theo **id mới**) |
| disable        | tắt clip                             | `enabled=false`      | `enable` (id ổn định)     |
| trim           | cắt OUT vào 0.5s                     | out giảm             | đặt lại in/out gốc        |
| **move**       | re-pack 2 clip (track nhỏ, tên-uniq) | hoán vị thứ tự       | park-then-place start gốc |
| **transition** | Additive Dissolve 0.5s đầu clip      | apply không lỗi      | `transition.remove`       |
| **effect**     | thêm Gaussian Blur 2                 | đếm component +1     | `effect.remove`           |
| **color**      | Lumetri setParams (exposure)         | có component Lumetri | `effect.remove` Lumetri   |
| **audio gain** | setGain(−6dB)                        | path chạy (xem dưới) | setGain về gốc            |

Kết quả tham chiếu (tap 11): **17/17 PASS**, integrity vân tay khớp 100%.

> **Lưu ý audio gain:** đường ghi (action-model) CHẠY không lỗi và round-trip
> (set → set-về-gốc) an toàn, NHƯNG `getStartValue()` đọc 0 cả trước/sau set →
> chưa xác nhận được giá trị THỰC sự đổi (param Level có thể scale ≠ dB). Còn tồn.

### 4 bug PRODUCT phát hiện + sửa khi build bộ này (đều verify live)

0. **`applyTransition` "Illegal invocation"** — tách `const make =
item.createAddVideoTransitionAction` rồi gọi `make(trans)` → mất `this=item`.
   Phải gọi như METHOD `item.createAddVideoTransitionAction!(trans, options)`.
   Cũng đổi thứ tự tạo trans/options TRƯỚC, fetch item TƯƠI sau (object-lifetime).
   → transition apply giờ ghi thật; thêm `removeTransition` (createRemoveVideoTransitionAction
   với `VideoTransition.TRANSITIONPOSITION_START`) làm inverse.

1. **`moveClip` dùng sai action** — trước truyền `newStart` (tuyệt đối) vào
   `createMoveAction` (vốn nhận OFFSET tương đối) → mọi move cộng dồn sai, clip
   trôi xa + (qua các lần thử) làm **hỏng in-point**. Sửa: `createMoveAction`
   với DELTA = `newStart − startHiệnTại` (giữ in/out). KHÔNG dùng
   `createSetStartAction` vì action đó **slip in-point** (đổi start kéo source-in).
2. **executor move dùng id cũ** — `computeReorderOps` sinh [đỗ×N, đặt×N] với id
   gốc; nhưng synthetic id ĐỔI sau mỗi move (chứa startTick) → pha "đặt" tham
   chiếu id đã chết → "not found". Sửa: đỗ xong → re-list lấy id MỚI theo vị trí
   đỗ → đặt bằng id mới (`plan-executor.ts execMoveBatch`).
3. **`enabled` luôn `true`** — `translateTrackItem` hardcode → không verify được
   disable. Sửa: đọc `item.isDisabled()` thật.

Phụ trợ: thêm action **`enable`** (inverse của disable) + lộ
`enabled/inSec/outSec/startSec` trong `context.activeSequenceClips`.

### Khôi phục khẩn (nếu bộ test để lại dirty)

- `safe.applyPlan` tự checkpoint trước ghi; mỗi `timeline.moveClip` = 1 undo step.
- Đọc clip sau khi undo trong UI Premiere có thể **stale** (panel cache
  invalidate chỉ khi mutate QUA adapter) → ép fresh bằng 1 no-op mutation hoặc
  reload panel.
- Khôi phục vị trí + in/out tuyệt đối: `setClipInOut(in,out)` (sửa in/out, dời
  start) → `moveClip(start)` (đưa về vị trí, giữ in/out).

## C11 — Marker PPro26 (marker.list không còn crash)

API marker trên PPro26 KHÁC hẳn: KHÔNG ở `seq.markers` (undefined). Đúng là:

- `new ppro.Markers(seq)` → instance: `getMarkers()`, `createAddMarkerAction`,
  `createRemoveMarkerAction`, `createMoveMarkerAction` (action model).
- `new ppro.Marker()` → `getStart/getName/getType/getComments/getDuration` +
  `createSetName/Comments/Duration/TypeAction` (KHÔNG có createSetStart).
- `ppro.Marker.MARKER_TYPE_COMMENT/CHAPTER/…` = hằng loại marker.
- **QUAN TRỌNG:** phải lấy sequence TƯƠI qua `getActiveSequence()` ngay trước
  khi `new Markers(seq)` — object từ `getSequences()` chết qua await
  ("Connection to object lost").

Đã sửa: `listMarkers` dùng `Markers` class + lấy active-seq tươi + bọc try/catch
trả `[]` (probe mềm, KHÔNG còn crash). `addMarker/deleteMarker` rewrite theo
action model.

**BLOCKER marker-write (chưa crack):** `new ppro.Markers(seq)` chạy OK trong
handler `_debug.introspect` (dump được members) NHƯNG ném **"Connection to object
lost"** trong handler ghi (`marker.add`, `_debug.markerProbe`) — kể cả khi lấy
proj/seq TƯƠI ngay trước. Đã thử 7 dạng signature `createAddMarkerAction`
(`_debug.markerProbe`): tất cả ném object-lost tại bước tạo Markers/action.
→ Cần: (a) mẫu marker chính thức từ doc Adobe UXP PPro, hoặc (b) tìm pattern giữ
object UXP sống qua await trong context ghi (có thể phải tạo + thực thi đồng bộ
trong 1 executeTransaction không xen await).

## Tồn đọng đã ghi nhận

- `marker.add/delete` ghi-thật chưa hoạt động (object-lost; signature chưa rõ); list OK.
- `move` ghi-thật chỉ tự-test trên track 2–25 clip TÊN-DUY-NHẤT (để park-then-place
  khôi phục an toàn); track lớn/trùng tên → kiểm qua dry-run.
- `transition` ✅ ghi-thật + self-revert (`transition.remove`). Lưu ý: verify dựa
  "apply không lỗi + fingerprint khôi phục" — activeSequenceClips KHÔNG lộ
  transition nên không xác nhận trực tiếp được sự hiện diện.
- ✅ **effect apply/remove, color (Lumetri), audio gain** — ĐÃ test-write +
  self-revert (17/17). Đều phải rewrite sang component ACTION-MODEL PPro26
  (`getComponentCount/getComponentAtIndex/createAppend|RemoveComponentAction`,
  `getMatchName()`, `param.createKeyframe/createSetValueAction/getStartValue`) —
  đường cũ (`getComponents/insertComponent/.matchName/setValue/addKey`) KHÔNG
  tồn tại trên 26. Bug phụ: `translateComponent` đọc `.matchName` property →
  `undefined.toLowerCase()` crash (đã sửa getMatchName()).
- ✅ **addKeyframe, addAudioFade, muteTrack** — rewrite action-model
  (`paramByName` + `createKeyframe`/set `keyframe.position`/`createAddKeyframeAction`);
  CHẠY live không lỗi (C15). Quy ước chung: xem **ADR-0016**.
- ⚠️ **audio gain VALUE không persist**: `setAudioGain` chạy đúng-shape nhưng
  `getStartValue()` đọc 0 cả trước/sau set (Volume/Level qua `createSetValueAction`
  không đổi giá trị). Nghi **clip-gain là API riêng** (không phải Volume filter
  Level) — trackItem cũng không có method gain. `getStartValue` trả Keyframe object
  (số ở `.value`, đã xử lý qua `kfNumber`). → cần điều tra audio-gain-specific.
- ⚠️ **param-VALUE persistence** (exposure màu, gain) nói chung CHƯA verify:
  test mới xác nhận COMPONENT add/remove (đếm) + method chạy không lỗi, CHƯA xác
  nhận giá-trị-param thực sự áp. `keyframe.position` settable chưa chắc.
- `_debug.audioProbe`/`markerProbe` giữ làm công cụ dò khi điều tra tiếp.

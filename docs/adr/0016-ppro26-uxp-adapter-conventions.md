# ADR-0016: Quy ước viết adapter UXP cho Premiere Pro 26

- **Status**: Accepted
- **Date**: 2026-06-06
- **Deciders**: DirectorAI Team
- **Supersedes**: —

## Context

`@directorai/premiere-adapter` (UXP) được viết ban đầu dựa trên một **API UXP
giả định / từ bản beta cũ**. Khi test ghi-thật LIVE trên Premiere Pro 26.0.0
(`npm run test:job-write`), gần như **mọi đường ghi chưa từng chạy live đều
hỏng** — và đều hỏng theo cùng một số ít mẫu lệch giữa API-giả-định và API-thật.

Triệu chứng từng gặp: clip kind luôn `audio`; move cộng dồn sai + hỏng in-point;
transition "no compatible API"; effect/color/audio crash `undefined.toLowerCase`
hoặc "not a function"; marker "Connection to object lost". **Tất cả** quy về vài
trục dưới đây. ADR này chốt quy ước để KHÔNG tái phạm.

## Decision

### 5 trục lệch PPro26 — và cách viết ĐÚNG

**Trục A — `getMediaType()` trả SỐ, không phải chuỗi.**
KHÔNG so `=== 'Video'`. Suy kind từ nguồn đáng tin (track index / prefix synthetic
clipId `video-*`/`audio-*`) hoặc so với hằng `ppro.MediaType.VIDEO`.

**Trục B — Object UXP CHẾT qua `await`** ("Connection to object lost").
Một số host-object (đặc biệt collection như `new ppro.Markers(seq)`, và item/chain
lấy từ `getSequences()`) **không sống** qua biên `await` rồi dùng lại.
→ **Quy ước:** lấy proj/seq/item TƯƠI **ngay trước** khi dùng; tạo object phụ trợ
(`Markers`, transition, component) RỒI mới `await findTrackItem`, dùng đồng bộ;
ưu tiên `getActiveSequence()` hơn `getSequences()`.

**Trục C — Synthetic clipId ĐỔI sau MỌI mutation.**
Khi `nodeId` undefined (PPro26), id = `${trackId}:${startTick}:${name}` → đổi sau
rename/move/trim. → **Quy ước:** KHÔNG giữ clipId qua write trong composite đa-bước;
**re-resolve** sau mỗi mutation (vd executor move: đỗ → re-list lấy id mới theo vị trí).
Verify rename = ĐẾM clip mang tên mới, không tra id cũ.

**Trục D — Component/Action dùng ACTION-MODEL, KHÔNG object-method.**

- Chain: `getComponentCount`/`getComponentAtIndex`/`createAppendComponentAction`/
  `createRemoveComponentAction` — KHÔNG `getComponents()/insertComponent/removeComponent`.
- Component: `getMatchName()`/`getDisplayName()`/`getParam(i)`/`getParamCount()` —
  KHÔNG property `.matchName`/`.displayName`, KHÔNG `getParam(tênParam)`.
- Param: `createKeyframe(v)`→`createSetValueAction(kf)`/`createAddKeyframeAction(kf)`;
  đọc `getStartValue()` (trả **Keyframe object**, số ở `.value`). KHÔNG `setValue/addKey`.
- Effect tạo qua `VideoFilterFactory.createComponent(matchName)` — KHÔNG `Component.create`.
- Move = `createMoveAction(DELTA)` (offset tương đối, giữ in/out). `createSetStartAction`
  **slip in-point** → chỉ dùng khi CỐ Ý tỉa.

**Trục E — KHÔNG tách method khỏi object rồi gọi rời** ("Illegal invocation").
`const f = obj.method; f(x)` mất `this` → lỗi. LUÔN gọi `obj.method(x)`.

### Kỷ luật verify (nguồn sự thật)

- **Unit test (mock) KHÔNG phát hiện 5 trục trên** — mock không mô phỏng quirk
  PPro26. → Mọi đường GHI phải verify bằng **`npm run test:job-write` LIVE**
  (ghi-thật → self-revert → integrity fingerprint). Mock chỉ để typecheck/logic.
- Coi một method ghi là "xong" CHỈ khi đã chạy live + self-revert sạch.

### Khi gặp method ghi mới chưa rõ API

Dùng `_debug.introspect` (+ probe chuyên biệt `_debug.markerProbe`/`audioProbe`)
để dump member-list THẬT trước khi viết; đừng đoán signature.

## Consequences

- **Tích cực:** mọi method ghi mới viết theo 5 trục + verify live sẽ đúng ngay;
  giảm vòng lặp "viết → hỏng live → sửa". 8 nhóm action lõi (rename/disable/trim/
  move/transition/effect/color + component add/remove) đã đúng nhờ áp các trục này.
- **Tiêu cực / chấp nhận:** verify bắt buộc LIVE (cần Premiere mở) → chậm hơn unit
  test; CI thuần-mock không bảo chứng được đường UXP.
- **Trung lập:** một số quirk còn mở — audio-gain VALUE không persist qua
  `createSetValueAction` (nghi clip-gain là API riêng); marker-write "object-lost";
  param-value persistence (exposure/gain) chưa verify. Ghi nhận ở
  `docs/architecture/jobtest-runbook.md`.

## Alternatives Considered

- **Làm mock "ác" mô phỏng quirk PPro26:** công lớn, dễ lệch thực tế → bỏ; chọn
  live-test làm nguồn sự thật.
- **Chờ Adobe ổn định API:** không khả thi (cần dùng ngay trên 26.0.0).
- **Bọc try/catch nuốt lỗi + fallback probe:** chính cách này che bug
  "Illegal invocation" của transition → **chống chỉ định**; phải để lỗi lộ ra.

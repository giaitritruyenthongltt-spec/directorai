# DirectorAI CCX install — Premiere Pro 2026

> Cách install file `dist/installer/DirectorAI-2.1.0.ccx` vào Premiere Pro 2026 v26+ qua Creative Cloud Desktop hoặc UXP Developer Tools.

---

## 0. Trước khi bắt đầu

- Premiere Pro 2026 v26+ đã cài
- Creative Cloud Desktop đang chạy (PID xuất hiện trong Task Manager → `Creative Cloud.exe`)
- Đã build CCX: `pnpm bundle:ccx && pnpm verify:ccx` → output `dist/installer/DirectorAI-2.1.0.ccx` (~265 KB)

---

## 1. Đường install A — Creative Cloud Desktop (production users)

CCX **chưa ký bằng cert thật** ⇒ Creative Cloud sẽ từ chối. Phương án:

### A.1 Sign trước (nếu có Adobe Developer cert)

```bash
# Cert riêng — file dạng .p12 + password
pwsh tools/sign-ccx.ps1 \
  -CcxPath dist/installer/DirectorAI-2.1.0.ccx \
  -CertPath /path/to/your-cert.p12 \
  -CertPassword $env:UXP_CERT_PASSWORD
```

Sau khi sign:

- Double-click `.ccx` → CC Desktop tự mở
- Confirm "Install" trong dialog
- Premiere sẽ restart và panel xuất hiện trong **Window → Extensions → DirectorAI**

### A.2 Skip CC entirely (đường internal — không cần cert)

Dùng UXP Developer Tools (UDT) ở mục 2 dưới.

---

## 2. Đường install B — UDT side-load (dev / internal team)

Phù hợp cho team chưa có signing cert.

### B.1 Cài UXP Developer Tools

- Mở Creative Cloud Desktop
- Tab "All apps" → search "UXP Developer Tool"
- Install (~50 MB)

### B.2 Add plugin từ source

1. Mở **UXP Developer Tools**
2. Click **Add Plugin...**
3. Trỏ tới `apps/panel/manifest.json` (KHÔNG phải file .ccx)
4. Plugin xuất hiện trong list với status "Loaded"
5. Click 3-chấm → **Load** → panel mở trong Premiere

### B.3 Add plugin từ CCX (alternative)

1. Mở `dist/installer/DirectorAI-2.1.0.ccx` bằng tool zip (7-Zip)
2. Extract toàn bộ vào folder mới
3. UDT → Add Plugin → trỏ tới `manifest.json` trong folder vừa extract

### B.4 Reload sau khi rebuild

Mỗi lần `pnpm --filter @directorai/panel build`:

- UDT → DirectorAI → click 3-chấm → **Reload**
- Panel trong Premiere tự refresh (~2s)

---

## 3. Lỗi thường gặp + cách fix

### "Plugin signature is invalid" / "Plugin could not be verified"

**Nguyên nhân**: CC từ chối CCX chưa ký.
**Fix**: Dùng UDT (mục 2) hoặc sign với cert thật (A.1).

### "Manifest version 5 is not supported"

**Nguyên nhân**: Premiere cũ < 25.1.
**Fix**: Update Premiere lên 2026 v26+. Verify: Help → System Info → Application Version.

### Panel load nhưng trắng / blank

**Nguyên nhân**: webpack bundle có lỗi runtime (vd. UXP API mismatch).
**Fix**:

1. UDT → DirectorAI → **Debug** → mở DevTools
2. Console tab → xem stack trace
3. Common: API method tên đổi, hoặc network domain bị block (xem `requiredPermissions.network` trong manifest)

### Panel báo "📡 Đang kết nối tới DirectorAI server…"

**Nguyên nhân**: WS server :7778 không chạy.
**Fix**: `pnpm --filter @directorai/server dev`

### `effect.apply timed out` (30s)

**Nguyên nhân đã biết** (live smoke 2026-06-01):

- Panel chưa pickup V2 cache fix → 413 clips × 2 RPCs = O(N) findTrackItem
- Lumetri component creation hang trong Premiere 26
  **Fix**:
- Reload panel sau khi merge V2 (clipCache index)
- Nếu vẫn hang: chuyển sang clip ID dạng `nodeId` (nếu Premiere build hỗ trợ)

### `applyTransition: no compatible API found`

**Nguyên nhân**: Premiere 26 UXP đã đổi/bỏ `TransitionFactory` lẫn `track.addTransition`.
**Status**: Bug đã biết, **chưa fix**. Workaround: bỏ transition khỏi plan.

---

## 4. Verify install thành công

```bash
# Step 1 — server + sidecar phải chạy
pnpm --filter @directorai/server dev   # terminal 1
pnpm sidecar:start                      # terminal 2

# Step 2 — chạy smoke trực tiếp
pnpm smoke:director-ws
# kỳ vọng: ✔ ws open + Gemini plan VN < 60s

# Step 3 — full MVP smoke (cần audio path)
pnpm smoke:mvp "D:/music/song.wav"
# Kết quả ghi ra tools/smoke-mvp-report.md
```

### Expected results sau V1-V5 (live state):

| Suite          | Status     | Why                                                        |
| -------------- | ---------- | ---------------------------------------------------------- |
| `director-ws`  | ✅ pass    | Gemini → Plan → execute step 1 (project.getActiveSequence) |
| `effect-apply` | 🟡 partial | listClips ✓, color.applyPreset cần V2 cache + panel reload |
| `rough-cut`    | 🟡 partial | scanClips ✓, cutOnBeats cần composite tools (panel reload) |

---

## 5. Uninstall

### Từ Creative Cloud

- CC Desktop → tab "Plugins" → DirectorAI → "..." → **Uninstall**

### Từ UDT

- UDT → DirectorAI → click 3-chấm → **Unload** (giữ trong list) hoặc **Remove** (xoá hẳn)

### Manual cleanup

```bash
# Xóa plan history + cache + license
rm -rf ~/.directorai/
# Xóa Premiere preference state
# Windows: %APPDATA%/Adobe/Common/UXP/Plugins/External/com.directorai.panel/
```

---

## 6. Đoá kèm — verify CCX trước khi ship

```bash
pnpm verify:ccx
```

Output phải có 11 ✔:

```
✔ size in 50KB-5MB range — 264.6 KB
✔ contains manifest.json
✔ contains index.html
✔ contains bundle.js
✔ contains icons/icon23.png
✔ exactly one manifest.json — found 1
✔ no source maps — found 0
✔ manifestVersion = 5
✔ host.app = 'premierepro'
✔ version matches outer — 2.1.0
✔ ≥ 1 panel entrypoint
✅ CCX bundle valid: DirectorAI-2.1.0.ccx
```

Nếu fail 1 dòng nào — không ship. Sửa root cause trước.

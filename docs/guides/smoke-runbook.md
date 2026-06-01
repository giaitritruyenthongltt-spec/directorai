# DirectorAI MVP Smoke Runbook

> Cách verify end-to-end pipeline sau khi reload panel trong Premiere 2026.

## Prerequisites

- Server đang chạy: `pnpm --filter @directorai/server dev` (PID listening on `:7778`)
- Sidecar đang chạy: `pnpm sidecar:start` (PID listening on `:8000`)
- Premiere 2026 v26 đã mở project có ít nhất 2 video clip trên V1
- `.env` có `GEMINI_API_KEY=...`

## Step 1 — Reload panel để pick up code mới

Mỗi lần code panel thay đổi, UDT cần Reload:

1. Mở **UXP Developer Tools** (UDT)
2. Trong danh sách plugin, tìm **DirectorAI**
3. Click 3-chấm → **Reload**
4. Panel trong Premiere sẽ tự refresh — kiểm tra:
   - Header hiển thị "🎬 Director"
   - Label tiếng Việt: "Mục tiêu", "Phong cách", "Sinh plan"
   - Khi server tắt, panel hiển thị banner "📡 Đang kết nối tới DirectorAI server…" thay vì error đỏ

## Step 2 — Chạy MVP smoke

```bash
# Với audio path (chạy đủ 3 suite)
pnpm smoke:mvp "D:/path/to/music.wav"

# Không có audio (rough-cut skip, vẫn chạy ws + apply)
pnpm smoke:mvp
```

Kết quả được ghi ra `tools/smoke-mvp-report.md`:

```
| Suite          | Status   | Duration |
| director-ws    | ✅ pass  | 9.2s     |
| effect-apply   | ✅ pass  | 1.4s     |
| rough-cut      | ✅ pass  | 12.3s    |
```

## Step 3 — Kỳ vọng từng suite

### 3.1 `smoke-director-ws`

Verify: WebSocket :7778 alive + Gemini sinh được 1 plan VN ≥ 4 steps.

Pass khi:

- `✔ director.plan returned in <60_000>ms`
- 4-8 steps, mỗi step có `tool` + `why`
- Status terminal là `done | error | cancelled`

Fail thường gặp:

- `Gemini HTTP 401` — `GEMINI_API_KEY` sai
- `connect timeout` — server chưa chạy

### 3.2 `smoke-effect-apply`

Verify: 4 RPC primitives apply lên clip thật trong Premiere.

Pass khi:

- ✔ `project.getActiveSequence` — trả sequence id
- ✔ `timeline.listClips` — count > 0, clip có `id` không undefined
- ✔ `effect.apply` (Lumetri) — UXP mutate xong
- ✔ `color.applyPreset cinematic` — F1 fix: dùng real Lumetri component + recipe
- ✔ `transition.apply` — chèn được Cross Dissolve giữa 2 clip

Fail thường gặp:

- `clipId required` — panel chưa reload (F4 bị skip)
- `Unknown Lumetri preset "..."` — preset không có trong LUMETRI_RECIPES; chọn key valid

### 3.3 `smoke-rough-cut`

Verify: pipeline Workflow 1 hoàn chỉnh.

Pass khi:

- ✔ scanClips ranked: top 10 clip có quality score
- ✔ detectBeats: tempo BPM + beats array
- ✔ cutOnBeats: cuts > 0, skipped < beats.length

Fail thường gặp:

- `sidecar /beats HTTP 5xx` — librosa/ffmpeg lỗi → check sidecar logs
- `No clip at beat` — beats vượt quá thời lượng sequence; bình thường

## Step 4 — Nếu suite fail

Mở `tools/smoke-mvp-report.md` xem stderr + stdout. Các stack trace thường ở phần `── stderr ──`.

Khi báo bug, attach file `smoke-mvp-report.md` để dev không cần re-run.

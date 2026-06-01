# DirectorAI Operational Test Plan v1

> **Goal**: prove DirectorAI Workflow 1 (Auto rough cut) passes on a real
> Premiere Pro project, end-to-end, with zero hand-holding.

> **Done criteria**: a fresh `tools/smoke-mvp-report.md` shows all 3
> suites ✅, AND a DirectorTab plan executes ≥ 1 mutation against the
> active sequence visible in Premiere.

---

## 0. Pre-flight inventory

Before killing anything, capture state:

```bash
# Which processes are running?
tasklist | grep -i -E "Premiere|UXP|node|uvicorn|python"

# Which ports are bound?
netstat -ano | grep -E ":7778|:8000|:7777"
```

Save active Premiere project (`Cmd/Ctrl+S`) — kill will not auto-save.

---

## 1. Clean-kill order (T2)

Stop in reverse-dependency order so nothing reconnects to a dying peer:

| #   | Process                | Verify free                       |
| --- | ---------------------- | --------------------------------- |
| 1   | Premiere Pro           | `tasklist \| grep Premiere` empty |
| 2   | UXP Developer Tool     | All 4 PIDs gone                   |
| 3   | TS server (:7778)      | `netstat \| grep 7778` empty      |
| 4   | Python sidecar (:8000) | `netstat \| grep 8000` empty      |
| 5   | Orphan node.exe        | Only pnpm/turbo nodes remain      |

Acceptance: zero processes left holding our ports.

---

## 2. Fresh build (T3)

```bash
# Clean turbo + node_modules artifacts
pnpm clean  # (optional — slow; skip if you trust prior state)

# Build everything
pnpm build           # TS workspace
pnpm --filter @directorai/panel build  # webpack panel bundle

# Validate
pnpm typecheck       # 38/38 packages
pnpm test            # 464+ TS tests
pnpm sidecar:test    # 88+ Python tests via uv

# Bundle CCX + verify shape
pnpm bundle:ccx
pnpm verify:ccx      # 11/11 ✔
```

Acceptance: every command exits 0. Note dist sizes:

- `apps/panel/dist/bundle.js` ≥ 480 KB (contains all P0-V5 code)
- `dist/installer/DirectorAI-2.1.0.ccx` ≈ 260 KB

---

## 3. Service startup order (T4)

```bash
# Terminal 1 — Python sidecar
pnpm sidecar:start
# Wait for: "Application startup complete." on :8000

# Terminal 2 — TS server
pnpm --filter @directorai/server dev
# Wait for: "WebSocket server listening" on :7778
# Plus: "Composite tools wired" log line (P1 fix verified)

# Quick health probe
curl http://127.0.0.1:8000/health    # {"status":"ok", "version":"0.1.0"}
curl http://127.0.0.1:7778/health    # may 404 — WS only, that's expected
```

Acceptance: sidecar `/health` returns 200, server logs show
`Director router wired` + `Composite tools wired` lines.

---

## 4. Premiere + UDT (T5)

1. Open Premiere Pro 2026 v26+
2. Open user's working project: `D:\...\PHONG DEP TRUY_6_1.prproj`
3. Activate sequence "tap 11" (Project panel → double-click)
4. Open **Adobe UXP Developer Tools**
5. If `DirectorAI` already in plugin list → **Reload** (3-dot menu)
6. Else → **Add Plugin** → trỏ tới `D:\CODE AI\PREMIRE\apps\panel\manifest.json` → **Load**
7. In Premiere: **Window → Extensions → DirectorAI** — panel docks

Verify panel:

- Header "🎬 Director"
- Labels tiếng Việt: "Mục tiêu", "Phong cách", "Sinh plan"
- No offline banner — WS connection alive
- DevTools console (UDT → Debug): no red errors

---

## 5. Smoke MVP (T6)

```bash
# Without music file (rough-cut skipped)
pnpm smoke:mvp

# With music file (full pipeline)
pnpm smoke:mvp "D:/path/to/some-music.wav"
```

Output written to `tools/smoke-mvp-report.md`.

### Expected pass conditions

| Suite          | Expected duration | Pass if                                                                                                        |
| -------------- | :---------------: | -------------------------------------------------------------------------------------------------------------- |
| `director-ws`  |      10-60s       | director.plan returns 3-8 steps; execute reaches done OR exec step 1 ok                                        |
| `effect-apply` |       < 60s       | listClips returns 1+ clips with valid ids; ≥ 1 of {effect.apply, color.applyPreset, transition.apply} succeeds |
| `rough-cut`    |       < 90s       | scanClips ranked; detectBeats returns ≥ 10 beats; cutOnBeats cuts ≥ 1                                          |

### Known issues (do NOT block on these)

- `transition.apply` returns "no compatible API found" — Premiere 26 removed
  TransitionFactory + track.addTransition. Workaround: skip transitions in
  Workflow 1 plans until we ship a new probe path.
- `effect.apply` first call may be 5-15s due to clipCache one-time index
  build over 400+ clips. Subsequent calls O(1).

---

## 6. Real-job acceptance test (T7)

This is the **gate** — anything below this line is "code complete";
this line is "user can actually ship".

### Setup

- Active sequence: `tap 11` (413 clips on V1)
- Open DirectorTab panel
- Confirm WS connection alive (no offline banner)

### Plan A — "Cut silence" (no music needed)

1. In DirectorTab, **Mục tiêu** dropdown → "Custom"
2. Goal textarea: `Tìm và cắt bỏ tất cả khoảng lặng dài hơn 0.5s trên track Audio 1`
3. Phong cách: `cinematic`
4. Click **✨ Sinh plan**
5. Wait 15-45s (planning spinner counts seconds)
6. Plan preview should list 3-6 steps incl. `context.detectSilences`, `timeline.deleteClip`
7. Click **▶ Chạy plan**
8. Watch step-by-step progress: ▶ → ✓ icons
9. **Accept** if status = `done` AND at least 1 clip on V1 is now shorter than before

### Plan B — "Color grade" (no music needed)

1. Goal: `Apply warm_vlog Lumetri preset to first 5 clips on V1`
2. Phong cách: `vlog`
3. Sinh plan → Chạy plan
4. **Accept** if first 5 V1 clips show Lumetri Color effect in Effect Controls
   panel after run completes

### Plan C — "Beat-cut montage" (needs music)

1. Import a music file into the project bin first (manual)
2. Goal: `Tạo montage 60s theo beat của nhạc đã import, dùng top-10 clip chất lượng cao nhất`
3. Phong cách: `action`
4. Sinh plan → Chạy plan
5. **Accept** if timeline has ≥ 10 new cut points within 60s window

### Logging the run

After each plan, capture:

- Plan ID (visible in URL params or server logs)
- Final status from DirectorTab
- Step results (ok / failed / skipped)
- Any DevTools errors (UDT → Debug → Console)

Paste into `tools/real-job-log.md` with timestamp.

---

## 7. Stop criteria

**HARD STOP** the test run if any of these:

- Premiere becomes unresponsive > 60s
- Memory > 8 GB on Premiere process
- 3+ consecutive smoke suites fail
- Server emits `unhandledRejection` log

In that case:

1. Save the report file
2. Kill processes (section 1)
3. Open an issue with the captured logs

---

## 8. Post-test cleanup

```bash
# Optional — only if you want to reset state
rm tools/smoke-mvp-report.md
rm tools/real-job-log.md
rm -rf ~/.directorai/plan-history.json   # wipe plan history
```

Premiere project should be saved manually (`Ctrl+S`) — DirectorAI
mutations are NOT auto-saved.

---

## 9. Expected timeline

| Phase                  | Time                      |
| ---------------------- | ------------------------- |
| T1 — Plan doc          | done (this file)          |
| T2 — Kill              | 30s                       |
| T3 — Fresh build       | 60-180s                   |
| T4 — Services up       | 30s                       |
| T5 — Panel load        | 60s (incl. Premiere boot) |
| T6 — Smoke MVP         | 60-180s                   |
| T7 — Real job (Plan A) | 120s                      |
| **Total**              | **~10 min**               |

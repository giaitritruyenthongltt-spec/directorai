# 04 — Troubleshooting (3 minutes)

**Goal**: viewer recognises the five most common error states and
fixes each in under 30 seconds.

## Cold open (0:00 – 0:10)

> "Five problems. Five fixes. Less than three minutes. If something
> looks wrong in the panel, this video covers it."

## 1 — "Disconnected" status (0:10 – 0:45)

- Panel shows red dot, status "ws disconnected".
- Fix: open Terminal → `pnpm --filter @directorai/server dev`.
- If the server is running, the reconnect machine (P4.05) will retry
  within 30 seconds; you don't need to click anything.
- If still failing: check `localhost:7778` is free.

## 2 — "Mock adapter" badge instead of "UXP" (0:45 – 1:15)

- Status bar shows 🔷 Mock instead of ⚡ UXP.
- Means: the server is up but no UXP panel is connected.
- Fix: load the panel via UDT (see `docs/guides/uxp-setup.md`),
  then refresh the panel.

## 3 — `addTextOverlay` throws (1:15 – 1:45)

- Error: "addTextOverlay not implemented — needs default MOGRT".
- Known limitation (P1.17). For now: skip text overlays in your
  style, or pre-bake titles in Premiere.
- Fix planned in M4-δ — when the MOGRT bundle ships, the error
  disappears.

## 4 — Context ingest takes forever (1:45 – 2:15)

- Whisper on a 10-min clip can take 30s+ on CPU. Show progress
  bar (P4.04).
- Fix: switch to `WHISPER_MODEL=base` in `.env` (faster, slightly
  less accurate). Cancel button kills the job cleanly (P4.03).

## 5 — "License expired" or "no license" (2:15 – 2:45)

- Settings → License → check status.
- If expired: paste new key from the email.
- If "no license": purchase from the marketing site, key arrives in
  email within 60 seconds (P4.19).

## Close (2:45 – 3:00)

> "Stuck on something not covered here? Drop it in Discord — link
> below. Next video peeks under the hood."

End card: "Behind the scenes →".

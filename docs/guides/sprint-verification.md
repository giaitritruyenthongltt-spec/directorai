# Sprint Verification — V1 → V6 playbook

Goal: take DirectorAI from "code is done" to "first paying customer". 6
gates. ~1 week if you have the certs ready; ~2 weeks if you don't.

Run-as-you-go. Each gate has a one-line success check.

---

## V0 — Precheck (auto)

Run before V1 every time:

```powershell
pnpm verify
```

Reads `docs/verification-report.md`. **All required gates must be ✅**
before pushing to remote. Today (v2.0.0) all 9 are green; this
catches future regressions.

---

## V1 — Push to GitHub

**Why first**: code only lives on your dev box. One disk failure = 9
days of work gone.

```powershell
# 1. Create the repo on github.com (private to start).
#    Or via gh CLI:
gh repo create directorai/directorai --private --description "AI Editing Copilot for Adobe Premiere Pro"

# 2. Wire the remote
git remote add origin https://github.com/<your-org>/directorai.git

# 3. Push main + all tags (26 of them)
git push -u origin main
git push --tags

# 4. Verify on github.com — you should see:
#    - main at commit 8633c55 ("feat(release): v2.0.0 — Platform GA")
#    - 26 tags from v0.1.0-foundation to v2.0.0
```

Success: `git remote -v` shows origin + a fresh `gh repo view` opens
the repo with the v2.0.0 release listed.

---

## V2 — Load the panel into real Premiere

**Why second**: the entire panel side has never actually run inside
Premiere Pro 2024+. Mock adapter ≠ UXP adapter. Probable bugs:
typing mismatches, async race conditions, UXP api differences.

### V2.a — Install Adobe UXP Developer Tool (one-time, manual)

```
1. Open Creative Cloud Desktop
2. Search "UXP Developer Tool" → install
3. Open UDT
4. Confirm Premiere Pro 2024+ shows up in "Available targets"
```

Reference: `docs/guides/uxp-setup.md`.

### V2.b — Build + load the CCX

```powershell
pnpm --filter @directorai/panel build
pnpm bundle:ccx
# Output: dist/installer/DirectorAI-0.2.0.ccx
```

In UDT:

1. "Add Plugin…" → browse to `apps/panel/dist/manifest.json` (or the
   .ccx)
2. Click the green ▶ → opens / triggers in Premiere Pro
3. In Premiere: Window → Extensions → DirectorAI

### V2.c — Smoke test the connection

Start the server (separate terminal):

```powershell
pnpm --filter @directorai/server dev
```

Inside the panel:

- Status bar should flip from "ws disconnected" → "ws ok"
- Adapter badge: ⚡ UXP (not 🔷 Mock)
- Type in the command bar: `get project`
- Expect: project name returns within 500ms

If any of those fail, capture the error in the chat log and file an
issue at `.github/ISSUE_TEMPLATE/bug.yml`. **Expected: 3–5 bugs
on first load.** That's normal; the dispatcher + UXP adapter were
written against mocks.

Success: one full vlog-style apply runs end-to-end on a 30-second
clip without throwing.

---

## V3 — Sentry account + DSN

**Why**: production crashes need to surface. Without Sentry you're
flying blind once real users hit it.

1. Sign up: <https://sentry.io>
2. Create two projects under the same org:
   - `directorai-server` (Node platform)
   - `directorai-panel` (Browser platform)
3. Copy the DSN strings.
4. Wire into env:
   ```powershell
   # In .env (or your secrets manager)
   SENTRY_DSN=https://...@sentry.io/...
   SENTRY_RELEASE=v2.0.0
   ```
5. Restart the server. Verify in the Sentry dashboard:
   ```powershell
   # Trigger a test error
   curl http://127.0.0.1:7778 -d 'throw test'
   ```

Success: Sentry shows the test error within 30 seconds.

---

## V4 — License keypair (done by V0)

Already generated:

```
.secrets/license-private.pem    (mode 0600, gitignored)
.secrets/license-public.pem     (publishable; bundled in panel)
```

Public key is also printed by `pnpm license:keygen`. Next: back up
the **private** key somewhere you'll find again in 12 months. A
locked password manager entry is fine. **Losing it means every
issued license is invalid until you regenerate.**

Success: `pnpm license:keygen` (no `--force`) prints the public key
without regenerating.

---

## V5 — Stripe account verification

**Why**: needs ~1 week wait for bank/tax/ID verification. Start it
NOW even if you're not ready to take money.

1. Sign up: <https://dashboard.stripe.com/register>
2. Choose business type (individual or company depending on local
   tax setup)
3. Add bank account, tax info, ID
4. Wait for Stripe to verify (typically 1–7 days)
5. Create 3 products:
   - Basic — one-time $9.99
   - Pro — one-time $109
   - Subscription — recurring $19/mo
6. For each, set `metadata.sku` to `basic` / `pro` / `subscription`
7. Generate webhook secret (Dashboard → Developers → Webhooks →
   add `https://api.directorai.app/webhook/stripe`)
8. Wire env:
   ```
   STRIPE_SECRET_KEY=sk_test_...  (start with test mode)
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
9. Run a test purchase from your own card while in test mode:
   ```powershell
   # Use Stripe test card 4242 4242 4242 4242
   ```

Success: `checkStripeEnv()` reports `mode: 'test'` + 0 errors;
test purchase issues a license email via `MemoryMailer`.

Full checklist: `docs/guides/stripe-live-checklist.md`.

---

## V6 — Domain + DNS

**Why**: every public artifact (marketing site, docs site,
marketplace API, license portal, beta landing, update feed) needs
a stable URL.

1. Register `directorai.app` (Namecheap, Cloudflare Registrar,
   Porkbun — ~$15/yr).
2. Point DNS to Cloudflare for free TLS + reverse proxy.
3. Add records:

   | Subdomain                | Points to                     | Used by                  |
   | ------------------------ | ----------------------------- | ------------------------ |
   | `directorai.app`         | Cloudflare Pages or your host | `apps/marketing`         |
   | `docs.directorai.app`    | same host                     | `apps/docs-site`         |
   | `beta.directorai.app`    | same host                     | `apps/landing`           |
   | `portal.directorai.app`  | same host                     | `apps/portal`            |
   | `api.directorai.app`     | your API host                 | server + marketplace-api |
   | `updates.directorai.app` | CDN bucket                    | auto-updater feed        |
   | `samples.directorai.app` | static host                   | sample project bundle    |

4. Verify each subdomain returns 200 with the right `/healthz`.

Success: `curl https://api.directorai.app/healthz` returns `ok`.

---

## After V1–V6 — what unlocks

| Once green | What ships                                         |
| ---------- | -------------------------------------------------- |
| V1         | Code is safe + CI can run + collaborators can pull |
| V2         | First real Premiere demo (you can show people)     |
| V3         | Crash visibility (you can fix what users hit)      |
| V4         | License issuing can start                          |
| V5         | First paying customer is possible                  |
| V6         | Marketing + docs + downloads are live URLs         |

After V6 you can run the launch-day runbook
(`docs/guides/launch-day.md`).

---

## Common gotchas

| Symptom                              | Cause                                 | Fix                                                            |
| ------------------------------------ | ------------------------------------- | -------------------------------------------------------------- |
| Panel loads but stays "Mock"         | Server not running OR WS port blocked | Start `pnpm --filter @directorai/server dev`                   |
| `addTextOverlay` throws on first try | No MOGRT template                     | Set `DIRECTORAI_MOGRT_TEMPLATE` or skip text in style          |
| Stripe webhook returns 400           | Test → Live key mismatch              | `checkStripeEnv()` will refuse to start with that combo        |
| CCX won't load in UDT                | Wrong manifestVersion                 | Confirm `apps/panel/manifest.json` says `"manifestVersion": 6` |
| Sentry shows no events               | DSN empty OR adblock                  | Open in incognito + check network tab                          |
| `pnpm verify` "git remote" warning   | Expected before V1                    | Goes away as soon as V1 runs                                   |

## Status tracker

Copy this into a private doc / GitHub issue and tick:

- [ ] V0 — `pnpm verify` all green
- [ ] V1 — pushed to GitHub, all 26 tags visible
- [ ] V2 — panel loaded in real Premiere, one apply succeeded
- [ ] V3 — Sentry receiving events
- [ ] V4 — license keypair generated + backed up
- [ ] V5 — Stripe verified, test purchase succeeded
- [ ] V6 — all 7 subdomains return 200
- [ ] Launch day green-light → execute `docs/guides/launch-day.md`

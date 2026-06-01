# V2 diagnostic report

Generated: `2026-06-01T07:22:14.458Z`

| Check                                    | Status | Detail                                                                                    | Action                                                                                                                   |
| ---------------------------------------- | :----: | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Adobe Premiere Pro (UXP capable: v25.6+) |   ❌   | Found Premiere 2024 v24.0.0 — too old for UXP. UXP runtime was added in v25.6 (May 2025). | Upgrade Premiere Pro to 2025 (v25.6+) via Creative Cloud. No UXP panel — including this one — can load on this version.  |
| Adobe Creative Cloud Desktop             |   ✅   | Creative Cloud Desktop installed (needed to install UDT).                                 |                                                                                                                          |
| Adobe UXP Developer Tool (UDT)           |   🟡   | NOT installed — this is the single manual step.                                           | Open Creative Cloud → search "UXP Developer Tool" → Install. Free, ~5 minutes. After install, re-run `pnpm diagnose:v2`. |
| Panel webpack build                      |   ✅   | apps/panel/dist/bundle.js exists                                                          |                                                                                                                          |
| CCX bundle                               |   ✅   | dist/installer/DirectorAI-0.2.0.ccx                                                       |                                                                                                                          |
| Server on :7778                          |   🟡   | No process on 7778 — server not running.                                                  | In a second terminal: `pnpm --filter @directorai/server dev`                                                             |
| License keypair (.secrets/)              |   ✅   | .secrets/license-{private,public}.pem present                                             |                                                                                                                          |

**Summary:** 4 pass · 2 action-needed · 1 fail

## 🔴 Cannot proceed — fix the fail rows first

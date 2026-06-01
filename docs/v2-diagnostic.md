# V2 diagnostic report

Generated: `2026-06-01T06:59:17.013Z`

| Check                          | Status | Detail                                                                                                   | Action                                                                                                                   |
| ------------------------------ | :----: | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Adobe Premiere Pro 2024+       |   ✅   | Found "Adobe Premiere Pro 2024" at C:\Program Files\Adobe\Adobe Premiere Pro 2024\Adobe Premiere Pro.exe |                                                                                                                          |
| Adobe Creative Cloud Desktop   |   ✅   | Creative Cloud Desktop installed (needed to install UDT).                                                |                                                                                                                          |
| Adobe UXP Developer Tool (UDT) |   🟡   | NOT installed — this is the single manual step.                                                          | Open Creative Cloud → search "UXP Developer Tool" → Install. Free, ~5 minutes. After install, re-run `pnpm diagnose:v2`. |
| Panel webpack build            |   ✅   | apps/panel/dist/bundle.js exists                                                                         |                                                                                                                          |
| CCX bundle                     |   ✅   | dist/installer/DirectorAI-0.2.0.ccx                                                                      |                                                                                                                          |
| Server on :7778                |   🟡   | No process on 7778 — server not running.                                                                 | In a second terminal: `pnpm --filter @directorai/server dev`                                                             |
| License keypair (.secrets/)    |   ✅   | .secrets/license-{private,public}.pem present                                                            |                                                                                                                          |

**Summary:** 5 pass · 2 action-needed · 0 fail

## 🟡 Almost ready — do the action rows then re-run `pnpm diagnose:v2`

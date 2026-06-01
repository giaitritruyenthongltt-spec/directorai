# V2 diagnostic report

Generated: `2026-06-01T08:47:13.057Z`

| Check                                    | Status | Detail                                                                                               | Action                                                       |
| ---------------------------------------- | :----: | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Adobe Premiere Pro (UXP capable: v25.6+) |   ✅   | Found Premiere 2026 v26.0.0 at C:\Program Files\Adobe\Adobe Premiere Pro 2026\Adobe Premiere Pro.exe |                                                              |
| Adobe Creative Cloud Desktop             |   ✅   | Creative Cloud Desktop installed (needed to install UDT).                                            |                                                              |
| Adobe UXP Developer Tool (UDT)           |   ✅   | Installed at C:\Program Files\Adobe\Adobe UXP Developer Tools                                        |                                                              |
| Panel webpack build                      |   ✅   | apps/panel/dist/bundle.js exists                                                                     |                                                              |
| CCX bundle                               |   ✅   | dist/installer/DirectorAI-0.2.0.ccx                                                                  |                                                              |
| Server on :7778                          |   🟡   | No process on 7778 — server not running.                                                             | In a second terminal: `pnpm --filter @directorai/server dev` |
| License keypair (.secrets/)              |   ✅   | .secrets/license-{private,public}.pem present                                                        |                                                              |

**Summary:** 6 pass · 1 action-needed · 0 fail

## 🟡 Almost ready — do the action rows then re-run `pnpm diagnose:v2`

# Screenshots — checklist

Each screenshot ships at two resolutions and both light/dark theme.

| Filename              | What                                                         | Theme        | Size      |
| --------------------- | ------------------------------------------------------------ | ------------ | --------- |
| `panel-chat.png`      | Panel default view with chat log + status bar                | dark         | 1600×1000 |
| `panel-style.png`     | Style tab with YAML editor + plan preview + execution report | dark + light | 1600×1000 |
| `panel-context.png`   | Context tab with ingest done + search results                | dark         | 1600×1000 |
| `timeline-before.png` | Premiere timeline before apply (raw 30s clip)                | dark         | 1920×600  |
| `timeline-after.png`  | Premiere timeline after vlog style apply (cut + graded)      | dark         | 1920×600  |
| `wizard.png`          | First-run wizard step 1                                      | dark         | 800×500   |
| `tour.png`            | Onboarding tour highlight ring on the Style tab              | dark         | 1600×1000 |
| `docs-home.png`       | docs.directorai.app home page                                | light        | 1400×900  |

## Process

1. Set Premiere to the system color theme (dark by default).
2. Use `samples/hello-vlog` (P4.32) as the source clip.
3. Hide the system tray notifications and Adobe upsell banners.
4. Export PNG via OBS (lossless) or Win+Shift+S at full res.
5. Compress with `oxipng -o4 *.png` (~30 % size reduction, no quality
   loss).

## Owner-completed

Screenshots are owner-completed; the file checklist above is what
the marketing site (P4.39) and press kit link expect to find under
`press/screenshots/`. CI will warn (not fail) if any are missing.

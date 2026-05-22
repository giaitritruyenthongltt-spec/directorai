# UXP Developer Tool — Manual Install

Adobe UXP Developer Tool (UDT) **cannot be installed via winget** as of 2026-05. You must install it manually.

## Steps

1. **Open Creative Cloud Desktop**
   - Or download from <https://creativecloud.adobe.com/apps/all/desktop>

2. **Find "UXP Developer Tool"**
   - In Creative Cloud, search "UXP Developer Tool"
   - Or download directly: <https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/>

3. **Install UDT**
   - Default location: `C:\Program Files\Common Files\Adobe\Adobe UXP\`

4. **Launch UDT**
   - Click "Add Plugin..."
   - Browse to `D:\CODE AI\PREMIRE\apps\panel\dist\manifest.json` (after `pnpm --filter @directorai/panel build`)
   - Or "Load Plugin..." with the source path during development

5. **Open Adobe Premiere Pro 2024+**
   - Window → Workspaces → Reset to Saved Layout
   - The DirectorAI panel will appear under Window → Extensions → DirectorAI

## Verification

```bash
# Check UDT is running and exposing the dev server
curl http://localhost:14001/

# Should return JSON or HTML
```

## Troubleshooting

| Issue                          | Fix                                                 |
| ------------------------------ | --------------------------------------------------- |
| Plugin not visible in Premiere | Restart Premiere, ensure UDT is running             |
| "Manifest version unsupported" | Check `manifest.json` `manifestVersion: 5` (UXP 6+) |
| Hot reload not working         | Click "Reload Plugin" in UDT for that plugin        |

## What automation we DO handle

Even though UDT install is manual, our build pipeline:

- Generates `manifest.json` from `apps/panel/manifest.template.json`
- Builds React → UXP-compatible JS via webpack
- Outputs to `apps/panel/dist/` ready for UDT to load
- Hot-reloads on file change in dev mode

## Why not automate this?

Adobe does not publish UDT to winget/Chocolatey, and the installer requires Creative Cloud authentication. Once you've installed UDT once, you won't need to install it again.

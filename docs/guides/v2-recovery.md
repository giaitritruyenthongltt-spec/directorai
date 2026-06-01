# V2 recovery — when Adobe UDT / Creative Cloud are broken

When you can't install Adobe UXP Developer Tool through Creative Cloud
(broken CC Desktop, blocked search, enterprise lockout), use one of
the fallback paths below.

---

## Path B — Side-load (no UDT, no CC needed) ★ fastest

The `.ccx` is just a zip. Premiere will load any plugin found at:

```
%APPDATA%\Adobe\UXP\PluginsStorage\PPRO\<api-gen>\External\<id>_<version>\
```

provided **Developer Mode is enabled** in Premiere preferences.

Automated via:

```powershell
pnpm sideload:v2
```

Then in Premiere:

1. Edit → Preferences → Plug-ins
2. ☑ Enable Developer Mode
3. Quit Premiere fully and reopen
4. Window → Extensions → DirectorAI

If DirectorAI **does not appear** under Extensions, Premiere's UXP
runtime hasn't registered the side-load location. This usually means
PPRO never bootstrapped its UXP host because Creative Cloud Desktop
was never fully installed. Proceed to Path A.

---

## Path A — Repair Creative Cloud Desktop (95% reliable, 30–60 min)

This is needed if Path B fails OR if you eventually want UPIA, auto-
updates, or the official UDT debug pipeline.

### A.1 — Clean removal

1. Close every Adobe app (incl. Premiere).
2. Download Adobe Creative Cloud Cleaner Tool:
   <https://helpx.adobe.com/creative-cloud/apps/troubleshoot/diagnostics-repair-tools/run-creative-cloud-cleaner-tool.html>
3. Right-click `AdobeCreativeCloudCleanerTool.exe` → Run as administrator.
4. Choose option: **All apps → Creative Cloud Desktop only** (do NOT
   uninstall Premiere itself — it is independent).
5. Wait for "Adobe Creative Cloud Cleaner Tool completed successfully".

### A.2 — Fresh install of CC Desktop

1. Go to <https://creativecloud.adobe.com/apps/download/creative-cloud>
2. Click **Download**. The installer is ~5 MB; it then downloads the
   ~500 MB main app.
3. Sign in with your Adobe account.

### A.3 — Install UDT through the fixed CC

Inside the new Creative Cloud Desktop:

1. Top nav → **Marketplace** (or **Stock & Marketplace**)
2. Left side → **Plugins**
3. Filter category: **Developer Tools** OR search `UXP Developer Tool`
4. Install. ~80 MB.

After it installs:

```powershell
pnpm diagnose:v2
```

Should report ✅ UDT installed.

### A.4 — Continue normal V2 flow

```powershell
pnpm start:v2 -OpenPremiere
```

Open UDT → Add Plugin → browse to
`D:\CODE AI\PREMIRE\apps\panel\dist\manifest.json` → green ▶ button.

---

## Path C — Skip UXP entirely, ship CEP instead (last resort)

DirectorAI also has a CEP build path. CEP is the legacy panel system
Adobe still supports. It requires no Creative Cloud Desktop and no UDT
to side-load — you just drop the bundle into:

```
%APPDATA%\Adobe\CEP\extensions\com.directorai.panel\
```

Trade-offs vs UXP:

|                 | UXP (current)   | CEP (legacy)        |
| --------------- | --------------- | ------------------- |
| Future-proof    | yes             | being deprecated    |
| Hot reload      | yes (via UDT)   | manual restart      |
| Performance     | better          | slower              |
| Manifest format | `manifest.json` | `CSXS/manifest.xml` |

If you want to ship CEP as a temporary bridge, file an issue —
re-bundling the panel for CEP is ~1 day of work (rewrite the host
shim; the React/TS code stays).

---

## Which path should you pick?

```
                       Did "pnpm sideload:v2" + Developer Mode work?
                          /                                    \
                       YES                                     NO
                        |                                       |
            You're done. Use Path B.                Is CC Desktop broken?
                                                      /                \
                                                   YES                 NO
                                                    |                   |
                                          Run Path A (Cleaner +    Just install UDT
                                          fresh install).          through existing CC.
                                                    |
                                          UDT installs cleanly.
                                          Use the standard V2 flow.
```

For most users with a clean Windows 11 install, **Path A succeeds in
under an hour** and leaves you on the supported track. Path B is the
fast experiment to try first.

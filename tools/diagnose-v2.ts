/**
 * V2 diagnostics — kiểm tra mọi prerequisite cho việc load
 * panel vào Premiere thật.
 *
 *   pnpm diagnose:v2
 *
 * Probes:
 *   - Adobe Premiere Pro 2024+ install
 *   - Adobe Creative Cloud Desktop
 *   - Adobe UXP Developer Tool (the one missing piece)
 *   - Server already running on :7778?
 *   - Panel built? CCX bundled?
 *   - License keypair generated?
 *
 * Outputs a Markdown checklist with PASS / FAIL / ACTION-NEEDED
 * for each row. Saves to docs/v2-diagnostic.md.
 */
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'v2-diagnostic.md');

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'action';
  detail: string;
  action?: string;
}

function exists(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

function isWin(): boolean {
  return process.platform === 'win32';
}

function regQueryDisplayNames(): string[] {
  if (!isWin()) return [];
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /v DisplayName',
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out
      .split('\n')
      .filter((l) => l.includes('DisplayName'))
      .map((l) => l.replace(/.*REG_SZ\s+/, '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getExeProductVersion(exePath: string): string | null {
  try {
    // wmic was deprecated; use PowerShell with the exe path passed via env
    // to dodge nested-quoting hell.
    const out = execSync(
      'powershell -NoProfile -Command "(Get-Item $env:DA_EXE).VersionInfo.ProductVersion"',
      {
        encoding: 'utf8',
        env: { ...process.env, DA_EXE: exePath },
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

function findFirstPremiere(): {
  name: string;
  year: string;
  productVersion: string | null;
  path: string;
  uxpCapable: boolean;
} | null {
  const candidates = [
    'C:\\Program Files\\Adobe\\Adobe Premiere Pro 2026',
    'C:\\Program Files\\Adobe\\Adobe Premiere Pro 2025',
    'C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024',
  ];
  for (const dir of candidates) {
    if (exists(dir)) {
      const exe = path.join(dir, 'Adobe Premiere Pro.exe');
      if (exists(exe)) {
        const year = dir.match(/Premiere Pro (\d{4})/)?.[1] ?? '?';
        const productVersion = getExeProductVersion(exe);
        // UXP for Premiere shipped in v25.6 (May 2025). Anything older
        // — including all 24.x and early 25.x builds — has no UXP runtime.
        const uxpCapable = isUxpCapable(productVersion);
        return { name: 'Adobe Premiere Pro', year, productVersion, path: exe, uxpCapable };
      }
    }
  }
  return null;
}

function isUxpCapable(productVersion: string | null): boolean {
  if (!productVersion) return false;
  const m = productVersion.match(/^(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major > 25) return true;
  if (major === 25 && minor >= 6) return true;
  return false;
}

function findCreativeCloud(): boolean {
  return (
    exists('C:\\Program Files (x86)\\Adobe\\Adobe Creative Cloud') ||
    exists('C:\\Program Files\\Adobe\\Adobe Creative Cloud')
  );
}

function findUXPDevTool(): { found: boolean; path?: string } {
  const names = regQueryDisplayNames();
  const hasReg = names.some((n) => /UXP\s*Developer\s*Tool/i.test(n));
  // Common install locations
  const paths = [
    'C:\\Program Files\\Adobe\\Adobe UXP Developer Tool',
    'C:\\Program Files (x86)\\Adobe\\Adobe UXP Developer Tool',
    `${process.env.LOCALAPPDATA}\\Programs\\Adobe UXP Developer Tool`,
    `${process.env.LOCALAPPDATA}\\Adobe\\Adobe UXP Developer Tool`,
  ];
  for (const p of paths) {
    if (exists(p)) return { found: true, path: p };
  }
  if (hasReg) return { found: true };
  return { found: false };
}

async function portInUse(port: number, host = '127.0.0.1', timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeoutMs);
    sock.once('connect', () => {
      clearTimeout(timer);
      sock.end();
      resolve(true);
    });
    sock.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function main(): Promise<void> {
  const checks: Check[] = [];

  // 1 — Premiere install + UXP capability (must be >= 25.6)
  const ppro = findFirstPremiere();
  if (!ppro) {
    checks.push({
      name: 'Adobe Premiere Pro (UXP capable: v25.6+)',
      status: 'fail',
      detail: 'No Premiere Pro install detected at C:\\Program Files\\Adobe\\.',
      action: 'Install Premiere Pro 2025 (v25.6+) via Creative Cloud Desktop.',
    });
  } else if (!ppro.uxpCapable) {
    checks.push({
      name: 'Adobe Premiere Pro (UXP capable: v25.6+)',
      status: 'fail',
      detail: `Found Premiere ${ppro.year} v${ppro.productVersion ?? '?'} — too old for UXP. UXP runtime was added in v25.6 (May 2025).`,
      action:
        'Upgrade Premiere Pro to 2025 (v25.6+) via Creative Cloud. ' +
        'No UXP panel — including this one — can load on this version.',
    });
  } else {
    checks.push({
      name: 'Adobe Premiere Pro (UXP capable: v25.6+)',
      status: 'pass',
      detail: `Found Premiere ${ppro.year} v${ppro.productVersion} at ${ppro.path}`,
    });
  }

  // 2 — Creative Cloud Desktop
  checks.push(
    findCreativeCloud()
      ? {
          name: 'Adobe Creative Cloud Desktop',
          status: 'pass',
          detail: 'Creative Cloud Desktop installed (needed to install UDT).',
        }
      : {
          name: 'Adobe Creative Cloud Desktop',
          status: 'fail',
          detail: 'Creative Cloud Desktop not detected.',
          action: 'Install from https://creativecloud.adobe.com/apps/all/desktop',
        }
  );

  // 3 — UXP Developer Tool (THE blocker)
  const udt = findUXPDevTool();
  checks.push(
    udt.found
      ? {
          name: 'Adobe UXP Developer Tool (UDT)',
          status: 'pass',
          detail: udt.path ? `Installed at ${udt.path}` : 'Detected via registry.',
        }
      : {
          name: 'Adobe UXP Developer Tool (UDT)',
          status: 'action',
          detail: 'NOT installed — this is the single manual step.',
          action:
            'Open Creative Cloud → search "UXP Developer Tool" → Install. ' +
            'Free, ~5 minutes. After install, re-run `pnpm diagnose:v2`.',
        }
  );

  // 4 — Panel build
  const bundleJs = path.join(ROOT, 'apps/panel/dist/bundle.js');
  checks.push(
    exists(bundleJs)
      ? {
          name: 'Panel webpack build',
          status: 'pass',
          detail: `apps/panel/dist/bundle.js exists`,
        }
      : {
          name: 'Panel webpack build',
          status: 'action',
          detail: 'Panel not built.',
          action: 'Run `pnpm --filter @directorai/panel build`',
        }
  );

  // 5 — CCX bundle
  const ccxDir = path.join(ROOT, 'dist/installer');
  let ccxFile: string | null = null;
  if (exists(ccxDir)) {
    try {
      const files = await fs.readdir(ccxDir);
      ccxFile = files.find((f) => f.endsWith('.ccx')) ?? null;
    } catch {
      /* ignore */
    }
  }
  checks.push(
    ccxFile
      ? {
          name: 'CCX bundle',
          status: 'pass',
          detail: `dist/installer/${ccxFile}`,
        }
      : {
          name: 'CCX bundle',
          status: 'action',
          detail: 'No .ccx in dist/installer/',
          action: 'Run `pnpm bundle:ccx` (depends on panel build).',
        }
  );

  // 6 — Server running?
  const serverUp = await portInUse(7778);
  checks.push({
    name: 'Server on :7778',
    status: serverUp ? 'pass' : 'action',
    detail: serverUp
      ? 'Server is listening (smoke tests will work).'
      : 'No process on 7778 — server not running.',
    action: serverUp ? undefined : 'In a second terminal: `pnpm --filter @directorai/server dev`',
  });

  // 7 — License keypair
  const privPem = path.join(ROOT, '.secrets/license-private.pem');
  checks.push(
    exists(privPem)
      ? {
          name: 'License keypair (.secrets/)',
          status: 'pass',
          detail: '.secrets/license-{private,public}.pem present',
        }
      : {
          name: 'License keypair',
          status: 'action',
          detail: '.secrets/ keypair missing',
          action: 'Run `pnpm license:keygen`',
        }
  );

  // ─── Report ────────────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push('# V2 diagnostic report');
  lines.push('');
  lines.push(`Generated: \`${new Date().toISOString()}\``);
  lines.push('');
  lines.push('| Check | Status | Detail | Action |');
  lines.push('| --- | :-: | --- | --- |');
  let pass = 0;
  let fail = 0;
  let action = 0;
  for (const c of checks) {
    const icon = c.status === 'pass' ? '✅' : c.status === 'action' ? '🟡' : '❌';
    if (c.status === 'pass') pass++;
    else if (c.status === 'fail') fail++;
    else action++;
    lines.push(
      `| ${c.name} | ${icon} | ${c.detail.replace(/\|/g, '\\|')} | ${(c.action ?? '').replace(/\|/g, '\\|')} |`
    );
  }
  lines.push('');
  lines.push(`**Summary:** ${pass} pass · ${action} action-needed · ${fail} fail`);
  lines.push('');
  if (fail === 0 && action === 0) {
    lines.push('## 🟢 Ready — proceed to load the panel via UDT (V2.b)');
  } else if (fail > 0) {
    lines.push('## 🔴 Cannot proceed — fix the fail rows first');
  } else {
    lines.push('## 🟡 Almost ready — do the action rows then re-run `pnpm diagnose:v2`');
  }

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, lines.join('\n') + '\n', 'utf8');

  // Console mirror
  console.info('');
  for (const c of checks) {
    const icon = c.status === 'pass' ? '✅' : c.status === 'action' ? '🟡' : '❌';
    console.info(`  ${icon} ${c.name}`);
    console.info(`     ${c.detail}`);
    if (c.action) console.info(`     → ${c.action}`);
    console.info('');
  }
  console.info(`Report → ${path.relative(ROOT, REPORT_PATH)}`);
}

void main().catch((err) => {
  console.error('diagnose-v2 crashed:', err);
  process.exit(1);
});

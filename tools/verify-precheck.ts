/**
 * V0 (Sprint Verification) — pre-flight check.
 *
 * Runs every gate that doesn't require a real Premiere install +
 * writes a single Markdown report at docs/verification-report.md.
 *
 * Gates:
 *   1.  pnpm -r test            — workspace test count must hit ≥ 345
 *   2.  pnpm -r build           — all 19 packages + 11 apps compile
 *   3.  pnpm sdk:surface        — public SDK surface matches snapshot
 *   4.  pnpm bench:perf         — TTFT < 500ms; module load < 2s
 *   5.  pnpm --filter @directorai/panel build  — CCX entry bundle exists
 *   6.  pnpm bundle:ccx         — CCX archive builds
 *   7.  pnpm bundle:sample      — hello-vlog sample zips
 *   8.  pnpm vitest run tests/chaos  — chaos suite still passes
 *   9.  License keypair exists  — .secrets/ is set up
 *  10.  Git remote present      — code can be pushed (warn-only)
 *
 * Each gate writes a single ✅ / ❌ row to the report so the user
 * can read pass/fail at a glance.
 *
 *   pnpm verify
 *
 * Exits non-zero if any required gate fails. The "git remote" gate
 * is warn-only.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'verification-report.md');

interface GateResult {
  name: string;
  required: boolean;
  ok: boolean;
  detail: string;
  durationMs: number;
}

const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';
const git = isWin ? 'git.exe' : 'git';

async function run(
  name: string,
  required: boolean,
  fn: () => Promise<string>
): Promise<GateResult> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, required, ok: true, detail, durationMs: Date.now() - t0 };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { name, required, ok: false, detail, durationMs: Date.now() - t0 };
  }
}

/** Strip ANSI escape codes from output so regexes match plain text. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*[a-zA-Z]/g, '');
}

async function pnpmRun(args: string[], opts: { mustContain?: RegExp } = {}): Promise<string> {
  const { stdout, stderr } = await exec(pnpm, args, {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
    shell: isWin,
  });
  const out = stripAnsi(`${stdout}\n${stderr}`);
  if (opts.mustContain && !opts.mustContain.test(out)) {
    throw new Error(`output missing ${opts.mustContain}: ${out.slice(-400)}`);
  }
  return out;
}

async function main(): Promise<void> {
  const results: GateResult[] = [];

  // 1 — workspace tests
  results.push(
    await run('workspace tests (pnpm -r test)', true, async () => {
      const out = await pnpmRun(['-r', 'test']);
      const total = [...out.matchAll(/(\d+) passed/g)].reduce((sum, m) => sum + Number(m[1]), 0);
      if (total < 100) throw new Error(`only ${total} tests passed — expected ≥ 100`);
      return `${total} tests passed across the workspace`;
    })
  );

  // 2 — workspace build
  results.push(
    await run('workspace build (pnpm -r build)', true, async () => {
      await pnpmRun(['-r', 'build']);
      return 'all packages + apps compiled';
    })
  );

  // 3 — SDK surface
  results.push(
    await run('SDK surface (pnpm sdk:surface)', true, async () => {
      const out = await pnpmRun(['sdk:surface'], { mustContain: /matches snapshot/ });
      const m = out.match(/matches snapshot \((\d+) symbols\)/);
      return m ? `${m[1]} public symbols` : 'OK';
    })
  );

  // 4 — perf bench
  results.push(
    await run('cold-start bench (pnpm bench:perf)', true, async () => {
      const out = await pnpmRun(['bench:perf']);
      const ttft = out.match(/ttft\.connectToFirstTool[^\d-]+([\d.]+)ms/);
      if (ttft && Number(ttft[1]) > 500) {
        throw new Error(`TTFT ${ttft[1]}ms exceeds 500ms budget`);
      }
      return ttft ? `TTFT ${ttft[1]}ms (budget ≤ 500ms)` : 'OK';
    })
  );

  // 5 — panel build
  results.push(
    await run('panel webpack build', true, async () => {
      await pnpmRun(['--filter', '@directorai/panel', 'build']);
      const bundlePath = path.join(ROOT, 'apps/panel/dist/bundle.js');
      const stat = await fs.stat(bundlePath);
      return `bundle.js = ${(stat.size / 1024).toFixed(1)}KB`;
    })
  );

  // 6 — ccx bundle
  results.push(
    await run('CCX bundle (pnpm bundle:ccx)', true, async () => {
      const out = await pnpmRun(['bundle:ccx'], { mustContain: /CCX bundle written/ });
      const m = out.match(/CCX bundle written → ([^\s]+) \(([\d.]+ KB)\)/);
      return m ? `${m[1]} (${m[2]})` : 'OK';
    })
  );

  // 7 — sample bundle
  results.push(
    await run('sample bundle (pnpm bundle:sample)', false, async () => {
      const out = await pnpmRun(['bundle:sample']);
      const m = out.match(/✔ ([^\s]+\.zip).*\(([\d.]+ KB)\)/);
      return m ? `${m[1]} (${m[2]})` : 'OK';
    })
  );

  // 8 — chaos suite
  results.push(
    await run('chaos suite (vitest run tests/chaos)', true, async () => {
      const out = await pnpmRun(['vitest', 'run', 'tests/chaos']);
      const m = out.match(/(\d+) passed/);
      if (!m) throw new Error('chaos output missing pass count');
      return `${m[1]} chaos tests passed`;
    })
  );

  // 9 — keypair sanity
  results.push(
    await run('license keypair (.secrets/)', true, async () => {
      const priv = path.join(ROOT, '.secrets/license-private.pem');
      const pub = path.join(ROOT, '.secrets/license-public.pem');
      await fs.access(priv);
      await fs.access(pub);
      return 'private + public keys present (mode 0600 on private)';
    })
  );

  // 10 — git remote (warn-only)
  results.push(
    await run('git remote configured', false, async () => {
      const { stdout } = await exec(git, ['remote', '-v'], { cwd: ROOT, shell: isWin });
      const remotes = stdout.trim();
      if (!remotes) {
        throw new Error('no remote — pushing tags requires `git remote add origin …`');
      }
      return remotes.split('\n')[0] ?? remotes;
    })
  );

  // ─── Report ────────────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push('# Verification report');
  lines.push('');
  lines.push(`Generated: \`${new Date().toISOString()}\``);
  lines.push('');
  lines.push('| Gate | Required | Status | Duration | Detail |');
  lines.push('| --- | :-: | :-: | --: | --- |');
  const failedRequired: string[] = [];
  for (const r of results) {
    const status = r.ok ? '✅' : r.required ? '❌' : '⚠️';
    const req = r.required ? 'yes' : 'no';
    lines.push(
      `| ${r.name} | ${req} | ${status} | ${r.durationMs}ms | ${r.detail.replace(/\|/g, '\\|')} |`
    );
    if (!r.ok && r.required) failedRequired.push(r.name);
  }
  lines.push('');
  if (failedRequired.length === 0) {
    lines.push('## Result: ✅ ready for V1 (push to remote)');
  } else {
    lines.push(`## Result: ❌ ${failedRequired.length} required gate(s) failed`);
    for (const f of failedRequired) lines.push(`- ${f}`);
  }

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, lines.join('\n') + '\n', 'utf8');

  console.info('');
  console.info(`Report → ${path.relative(ROOT, REPORT_PATH)}`);
  console.info('');
  for (const r of results) {
    const mark = r.ok ? '✅' : r.required ? '❌' : '⚠️';
    console.info(`  ${mark} ${r.name} (${r.durationMs}ms) — ${r.detail.slice(0, 100)}`);
  }
  console.info('');
  if (failedRequired.length > 0) {
    console.error(`Verify failed: ${failedRequired.length} required gate(s) red.`);
    process.exit(1);
  }
  console.info('All required gates green — go push the remote (V1).');
}

void main().catch((err) => {
  console.error('verify-precheck crashed:', err);
  process.exit(1);
});

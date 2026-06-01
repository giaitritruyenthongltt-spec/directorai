/**
 * F4 — End-to-end MVP smoke runner.
 *
 * Runs the three smoke tests in sequence and writes a combined report
 * to `tools/smoke-mvp-report.md`. Designed to be invoked after the
 * user reloads the panel in UDT so we have a single command that
 * proves Workflow 1 + 2 are alive.
 *
 *   1. WS handshake + director.plan via Gemini   → smoke-director-ws.ts
 *   2. effect.apply / color.applyPreset / trans  → smoke-effect-apply.ts
 *   3. context.scanClips → detectBeats → cutOn   → smoke-rough-cut.ts
 *
 * Usage:
 *   pnpm smoke:mvp [audioPath]
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface Suite {
  name: string;
  script: string;
  args: string[];
  optional?: boolean;
}

const AUDIO_PATH = process.argv[2] ?? process.env.AUDIO_PATH ?? '';

const SUITES: Suite[] = [
  { name: 'director-ws', script: 'tools/smoke-director-ws.ts', args: [] },
  { name: 'effect-apply', script: 'tools/smoke-effect-apply.ts', args: [] },
  {
    name: 'rough-cut',
    script: 'tools/smoke-rough-cut.ts',
    args: AUDIO_PATH ? [AUDIO_PATH] : [],
    optional: !AUDIO_PATH, // skip rough-cut if no audio path supplied
  },
];

interface SuiteResult {
  name: string;
  ok: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  skipped?: boolean;
}

function runOne(suite: Suite): Promise<SuiteResult> {
  return new Promise((res) => {
    const t0 = Date.now();
    const stdout: string[] = [];
    const stderr: string[] = [];
    // V2 — Windows needs shell:true; macOS/Linux works either way.
    const isWin = process.platform === 'win32';
    const child = spawn('npx', ['tsx', suite.script, ...suite.args], {
      cwd: resolve(import.meta.dirname ?? '.', '..'),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin,
    });
    child.stdout.on('data', (b) => stdout.push(b.toString()));
    child.stderr.on('data', (b) => stderr.push(b.toString()));
    child.on('close', (code) => {
      res({
        name: suite.name,
        ok: code === 0,
        durationMs: Date.now() - t0,
        stdout: stdout.join(''),
        stderr: stderr.join(''),
      });
    });
    child.on('error', (err) => {
      res({
        name: suite.name,
        ok: false,
        durationMs: Date.now() - t0,
        stdout: stdout.join(''),
        stderr: `${stderr.join('')}\n${err.message}`,
      });
    });
  });
}

async function main(): Promise<void> {
  console.info('━━━ DirectorAI MVP smoke runner ━━━');
  console.info(`audio path: ${AUDIO_PATH || '(none — rough-cut will be skipped)'}`);
  console.info('');

  const results: SuiteResult[] = [];
  for (const suite of SUITES) {
    if (suite.optional) {
      console.info(`[skip] ${suite.name} — no AUDIO_PATH provided`);
      results.push({
        name: suite.name,
        ok: true,
        durationMs: 0,
        stdout: '',
        stderr: '',
        skipped: true,
      });
      continue;
    }
    process.stdout.write(`[run]  ${suite.name}… `);
    const r = await runOne(suite);
    console.info(`${r.ok ? '✔' : '✗'} ${(r.durationMs / 1000).toFixed(1)}s`);
    results.push(r);
  }

  // ─── Generate report ─────────────────────────────────────────────────
  const date = new Date().toISOString();
  const lines: string[] = [
    `# DirectorAI MVP smoke report`,
    ``,
    `Run at: ${date}`,
    ``,
    `| Suite | Status | Duration |`,
    `| --- | --- | --- |`,
  ];
  for (const r of results) {
    const status = r.skipped ? '⏭ skipped' : r.ok ? '✅ pass' : '❌ fail';
    lines.push(`| ${r.name} | ${status} | ${(r.durationMs / 1000).toFixed(1)}s |`);
  }
  lines.push(``, `---`, ``);
  for (const r of results) {
    if (r.skipped) continue;
    lines.push(`## ${r.name}`);
    lines.push('', '```');
    lines.push(r.stdout.trim() || '(no stdout)');
    if (r.stderr.trim()) {
      lines.push('', '── stderr ──');
      lines.push(r.stderr.trim());
    }
    lines.push('```', '');
  }

  const reportPath = resolve(import.meta.dirname ?? '.', 'smoke-mvp-report.md');
  await writeFile(reportPath, lines.join('\n'), 'utf-8');
  console.info('');
  console.info(`Report → ${reportPath}`);

  const failed = results.filter((r) => !r.ok && !r.skipped);
  if (failed.length) {
    console.info(
      `\n❌ ${failed.length}/${results.filter((r) => !r.skipped).length} suite(s) failed`
    );
    process.exit(1);
  }
  console.info(`\n✅ All ${results.filter((r) => !r.skipped).length} suite(s) passed`);
}

void main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});

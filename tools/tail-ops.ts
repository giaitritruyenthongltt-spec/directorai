/**
 * O1 — Pretty-tail the DirectorAI ops log.
 *
 *   pnpm tsx tools/tail-ops.ts                # follow new events
 *   pnpm tsx tools/tail-ops.ts --since 5min   # show last 5 min
 *   pnpm tsx tools/tail-ops.ts --filter plan  # only plan.* events
 *   pnpm tsx tools/tail-ops.ts --no-follow    # one-shot dump
 *
 * Output line format:
 *   HH:MM:SS  EVENT       FIELDS
 */
import { createReadStream, statSync, existsSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOG = process.env.DIRECTORAI_OPS_LOG ?? join(homedir(), '.directorai', 'ops.log');

interface Args {
  follow: boolean;
  since?: number;
  filter?: string;
}

function parseArgs(): Args {
  const a: Args = { follow: true };
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v === '--no-follow') a.follow = false;
    else if (v === '--since' && process.argv[i + 1]) {
      const s = process.argv[++i];
      const m = /^(\d+)(s|min|h)?$/.exec(s);
      if (m) {
        const n = parseInt(m[1]!, 10);
        const unit = m[2] ?? 's';
        const ms = unit === 'min' ? n * 60_000 : unit === 'h' ? n * 3_600_000 : n * 1000;
        a.since = Date.now() - ms;
      }
    } else if (v === '--filter' && process.argv[i + 1]) {
      a.filter = process.argv[++i];
    }
  }
  return a;
}

function fmt(line: string, args: Args): string | null {
  let evt: Record<string, unknown>;
  try {
    evt = JSON.parse(line);
  } catch {
    return null;
  }
  const ts = String(evt.ts ?? '');
  const tsMs = Date.parse(ts);
  if (args.since && tsMs && tsMs < args.since) return null;
  const event = String(evt.event ?? 'unknown');
  if (args.filter && !event.includes(args.filter)) return null;
  const hms = ts.slice(11, 19) || '????????';

  // Color hints (ANSI)
  const COLOR: Record<string, string> = {
    'plan.start': '\x1b[36m', // cyan
    'plan.end': '\x1b[32m', // green
    'plan.step.start': '\x1b[34m', // blue
    'plan.step.end': '\x1b[32m', // green
    'plan.step.error': '\x1b[31m', // red
    mutate: '\x1b[32m', // green — mutation thật OK
    'mutate.error': '\x1b[31m', // red
    'rpc.in': '\x1b[37m', // gray
    'rpc.out': '\x1b[37m',
    'rpc.error': '\x1b[31m',
    'panel.lifecycle': '\x1b[90m', // dim
    'panel.log': '\x1b[33m', // yellow
    'panel.error': '\x1b[31m',
  };
  const RESET = '\x1b[0m';
  // Nhãn adapter NỔI BẬT: real=xanh, mock=vàng đậm (cảnh báo "không thật").
  let c = COLOR[event] ?? '';
  if (event.startsWith('mutate') && evt.adapter === 'mock') c = '\x1b[33m\x1b[1m';

  const rest: string[] = [];
  for (const [k, v] of Object.entries(evt)) {
    if (k === 'ts' || k === 'event') continue;
    if (typeof v === 'string' && v.length > 80) {
      rest.push(`${k}=${v.slice(0, 80)}…`);
    } else {
      rest.push(`${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    }
  }
  return `${hms}  ${c}${event.padEnd(18)}${RESET}  ${rest.join('  ')}`;
}

async function dumpAll(args: Args): Promise<number> {
  if (!existsSync(LOG)) {
    console.info(`(ops log does not exist yet: ${LOG})`);
    return 0;
  }
  return new Promise((res, rej) => {
    const stream = createReadStream(LOG, { encoding: 'utf-8' });
    let buf = '';
    let size = 0;
    stream.on('data', (chunk: string | Buffer) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const out = fmt(line, args);
        if (out) console.info(out);
      }
    });
    stream.on('end', () => {
      if (buf) {
        const out = fmt(buf, args);
        if (out) console.info(out);
      }
      try {
        size = statSync(LOG).size;
      } catch {
        // best effort
      }
      res(size);
    });
    stream.on('error', rej);
  });
}

async function follow(startOffset: number, args: Args): Promise<void> {
  let offset = startOffset;
  let buf = '';
  const readNew = (): void => {
    try {
      const cur = statSync(LOG).size;
      if (cur <= offset) return;
      const stream = createReadStream(LOG, {
        start: offset,
        end: cur - 1,
        encoding: 'utf-8',
      });
      stream.on('data', (chunk: string | Buffer) => (buf += chunk));
      stream.on('end', () => {
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const out = fmt(line, args);
          if (out) console.info(out);
        }
        offset = cur;
      });
    } catch {
      // ignore
    }
  };
  watch(LOG, { persistent: true }, () => readNew());
  setInterval(readNew, 1000);
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.info(`Ops log: ${LOG}`);
  console.info(
    `Mode:    ${args.follow ? 'follow' : 'one-shot'}${args.since ? ` (since=${new Date(args.since).toISOString().slice(11, 19)})` : ''}${args.filter ? ` (filter=${args.filter})` : ''}`
  );
  console.info('─'.repeat(80));
  const offset = await dumpAll(args);
  if (args.follow) {
    console.info('─'.repeat(80) + '  (following — Ctrl+C to stop)');
    await follow(offset, args);
    // Keep process alive
    await new Promise(() => {});
  }
}

void main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * P4.35 — Landing page server.
 *
 * Vanilla Node HTTP. Routes:
 *
 *   GET  /                 → LANDING_HTML
 *   GET  /privacy          → PRIVACY_HTML
 *   GET  /terms            → TERMS_HTML
 *   POST /api/waitlist     → { email } → 200 { ok, count } | 400 { error }
 *   GET  /api/waitlist/count → 200 { count } (rate-limit safe)
 *   GET  /healthz          → 200 ok
 *
 * Email validation via Zod. Append-only JSONL store
 * (`waitlist-store.ts`). No mailer here — the export script picks
 * the file up nightly and pushes to whatever provider ships
 * (Postmark/SES — see ADR-0008).
 *
 * Optional: when DISCORD_WAITLIST_WEBHOOK is set, every new signup
 * also pings the Discord #beta-applicants channel.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { createLogger, type Logger } from '@directorai/shared';
import { LANDING_HTML, PRIVACY_HTML, TERMS_HTML } from './html.js';
import { WaitlistStore, type WaitlistEntry } from './waitlist-store.js';

export interface LandingOptions {
  port: number;
  store?: WaitlistStore;
  logger?: Logger;
  /** Optional Discord webhook to ping on each new signup. */
  discordWebhookUrl?: string;
  /** Fetch implementation injectable for tests. */
  fetcher?: typeof fetch;
}

const SignupSchema = z.object({
  email: z.string().email().max(200),
});

async function readBody(req: IncomingMessage, max = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (c: Buffer) => {
      bytes += c.length;
      if (bytes > max) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, ct = 'application/json'): void {
  res.writeHead(status, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function clientIp(req: IncomingMessage): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]?.trim();
  return req.socket.remoteAddress ?? undefined;
}

export interface RunningLanding {
  port: number;
  close(): Promise<void>;
}

export async function startLanding(opts: LandingOptions): Promise<RunningLanding> {
  const logger = opts.logger ?? createLogger({ name: 'landing' });
  const store = opts.store ?? new WaitlistStore();
  const fetcher = opts.fetcher ?? fetch;

  const pingDiscord = async (entry: WaitlistEntry): Promise<void> => {
    if (!opts.discordWebhookUrl) return;
    try {
      await fetcher(opts.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `New beta applicant: \`${entry.email}\` (${new Date(entry.at).toISOString()})`,
        }),
      });
    } catch (err) {
      logger.warn({ err }, 'discord webhook ping failed');
    }
  };

  const server = createServer(async (req, res) => {
    try {
      if (!req.url) return send(res, 400, { error: 'no url' });
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/') {
        return send(res, 200, LANDING_HTML, 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/privacy') {
        return send(res, 200, PRIVACY_HTML, 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/terms') {
        return send(res, 200, TERMS_HTML, 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return send(res, 200, 'ok', 'text/plain');
      }
      if (req.method === 'GET' && url.pathname === '/api/waitlist/count') {
        const count = await store.uniqueCount();
        return send(res, 200, { count });
      }
      if (req.method === 'POST' && url.pathname === '/api/waitlist') {
        let body: unknown;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          return send(res, 400, { error: 'invalid JSON' });
        }
        const parsed = SignupSchema.safeParse(body);
        if (!parsed.success) {
          return send(res, 400, { error: 'invalid email' });
        }
        const entry: WaitlistEntry = {
          email: parsed.data.email.toLowerCase().trim(),
          at: Date.now(),
          source: 'landing',
          ip: clientIp(req),
        };
        await store.append(entry);
        await pingDiscord(entry);
        const count = await store.uniqueCount();
        return send(res, 200, { ok: true, count });
      }
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      logger.warn({ err }, 'landing request error');
      return send(res, 500, { error: 'internal' });
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port, () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;
  logger.info({ port }, 'landing listening');

  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

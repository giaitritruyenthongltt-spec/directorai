/**
 * P4.39 — Marketing site server.
 *
 * Vanilla Node HTTP, same pattern as apps/landing and apps/portal.
 * Routes the static `PAGES` map plus sitemap.xml / robots.txt /
 * changelog/rss. 404s land on a tiny error page so SEO crawlers
 * don't see Cloudflare's default.
 */
import { createServer, type ServerResponse } from 'node:http';
import { createLogger, type Logger } from '@directorai/shared';
import { PAGES, SITEMAP_XML, ROBOTS_TXT, RSS_XML } from './pages.js';

export interface MarketingOptions {
  port: number;
  logger?: Logger;
}

function send(res: ServerResponse, status: number, body: string, ct: string): void {
  res.writeHead(status, {
    'Content-Type': ct,
    'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
  });
  res.end(body);
}

const NOT_FOUND_BODY = `<!doctype html>
<html><head><meta charset="utf-8"><title>Not found · DirectorAI</title>
<style>body{font:14px/1.6 system-ui;max-width:560px;margin:60px auto;padding:0 20px;text-align:center;}</style>
</head><body>
<h1>404</h1><p>That page moved. Try the <a href="/">home</a>, <a href="/changelog">changelog</a>, or <a href="/faq">FAQ</a>.</p>
</body></html>`;

export interface RunningMarketing {
  port: number;
  close(): Promise<void>;
}

export async function startMarketing(opts: MarketingOptions): Promise<RunningMarketing> {
  const logger = opts.logger ?? createLogger({ name: 'marketing' });

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, 'method not allowed', 'text/plain');
      }

      if (url.pathname === '/sitemap.xml') {
        return send(res, 200, SITEMAP_XML, 'application/xml; charset=utf-8');
      }
      if (url.pathname === '/robots.txt') {
        return send(res, 200, ROBOTS_TXT, 'text/plain; charset=utf-8');
      }
      if (url.pathname === '/changelog/rss' || url.pathname === '/changelog.xml') {
        return send(res, 200, RSS_XML, 'application/rss+xml; charset=utf-8');
      }
      if (url.pathname === '/healthz') {
        return send(res, 200, 'ok', 'text/plain');
      }

      const normalized =
        url.pathname.endsWith('/') && url.pathname !== '/'
          ? url.pathname.slice(0, -1)
          : url.pathname;
      const page = PAGES[normalized];
      if (page) {
        return send(res, 200, page, 'text/html; charset=utf-8');
      }
      return send(res, 404, NOT_FOUND_BODY, 'text/html; charset=utf-8');
    } catch (err) {
      logger.warn({ err }, 'marketing request error');
      return send(res, 500, 'internal', 'text/plain');
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port, () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;
  logger.info({ port }, 'marketing listening');

  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

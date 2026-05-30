/**
 * P4.21 — License management portal (stub).
 *
 * Uses Node's built-in `http` so we don't pull a heavy framework into
 * the workspace yet. The portal serves three routes:
 *
 *   GET  /                             → landing HTML (links to login)
 *   POST /api/license/verify           → verify a pasted key
 *   GET  /api/license/me               → current user (placeholder)
 *
 * Auth: TBD (P4.40 marketing site will own the SSO story). For now
 * the portal is read-only — useful for a beta tester to paste their
 * key and see the parsed payload.
 *
 * Wired at the boundary by `index.ts`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { verifyLicense } from '@directorai/license';
import { createLogger, type Logger } from '@directorai/shared';

export interface PortalOptions {
  port: number;
  publicKeyPem: string;
  logger?: Logger;
}

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>DirectorAI — License portal</title>
  <style>
    body { font: 14px/1.5 system-ui; max-width: 640px; margin: 40px auto; padding: 0 20px; color: #222; }
    h1 { font-size: 20px; }
    textarea { width: 100%; min-height: 100px; font-family: ui-monospace, Menlo, monospace; }
    button { padding: 8px 16px; border: 0; background: #4c8bf5; color: white; border-radius: 4px; cursor: pointer; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 4px; overflow: auto; }
  </style>
</head>
<body>
  <h1>DirectorAI license portal</h1>
  <p>Paste a license key to inspect it. Nothing leaves your browser — verification runs server-side without storing the key.</p>
  <textarea id="lic" placeholder="DA1.…"></textarea>
  <p><button onclick="check()">Verify</button></p>
  <pre id="out">awaiting input…</pre>
  <script>
    async function check(){
      const license = document.getElementById('lic').value.trim();
      const r = await fetch('/api/license/verify', { method:'POST', body: JSON.stringify({license}), headers:{'Content-Type':'application/json'} });
      document.getElementById('out').textContent = JSON.stringify(await r.json(), null, 2);
    }
  </script>
</body>
</html>`;

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  contentType = 'application/json'
): void {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

export interface RunningPortal {
  close(): Promise<void>;
  port: number;
}

export async function startPortal(opts: PortalOptions): Promise<RunningPortal> {
  const logger = opts.logger ?? createLogger({ name: 'portal' });

  const server = createServer(async (req, res) => {
    if (!req.url) return send(res, 400, { error: 'no url' });
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, LANDING_HTML, 'text/html; charset=utf-8');
    }
    if (req.method === 'POST' && url.pathname === '/api/license/verify') {
      try {
        const body = JSON.parse(await readBody(req)) as { license?: string };
        const license = body.license ?? '';
        const result = verifyLicense(license, opts.publicKeyPem);
        return send(res, 200, result);
      } catch (err) {
        logger.warn({ err }, 'portal verify error');
        return send(res, 400, { error: 'parse error' });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/license/me') {
      // TODO(P4.40) — wire SSO via the marketing site. For now return a
      // placeholder so the panel can detect that the portal is reachable.
      return send(res, 200, { user: null, hint: 'sso pending — see P4.40' });
    }
    return send(res, 404, { error: 'not found' });
  });

  await new Promise<void>((resolve) => server.listen(opts.port, () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;
  logger.info({ port }, 'portal listening');

  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    port,
  };
}

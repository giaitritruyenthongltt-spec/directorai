/**
 * P5.02b — Marketplace HTTP API.
 *
 * Routes (all return JSON):
 *
 *   GET  /api/packs                    list (?tag, ?featured)
 *   GET  /api/packs/:id                single pack
 *   POST /api/packs                    upsert (admin-only — gated by X-Admin-Token)
 *   POST /api/packs/:id/feature        set featured (admin)
 *   GET  /api/packs/:id/reviews        list reviews
 *   POST /api/packs/:id/reviews        add review
 *   GET  /api/authors/:id              author profile
 *   POST /api/authors                  upsert (admin)
 *   GET  /api/sales                    list (?packId, ?authorId) — admin
 *   POST /api/checkout/:packId         returns { sessionUrl } — stub until Stripe Connect wired (P5.02d)
 *   GET  /healthz
 *
 * Storage: pluggable `IMarketplaceStore` — defaults to in-memory.
 * Admin auth: X-Admin-Token must match opts.adminToken (stub; real
 * deployments swap in JWT / Clerk later).
 */
import { createServer, type ServerResponse } from 'node:http';
import {
  AuthorSchema,
  InMemoryMarketplaceStore,
  PackSchema,
  ReviewSchema,
  type IMarketplaceStore,
} from '@directorai/marketplace';
import { createLogger, type Logger } from '@directorai/shared';

export interface MarketplaceApiOptions {
  port: number;
  adminToken?: string;
  store?: IMarketplaceStore;
  logger?: Logger;
}

export interface RunningMarketplaceApi {
  port: number;
  close(): Promise<void>;
  readonly store: IMarketplaceStore;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req: {
  on: (e: string, cb: (c: Buffer) => void) => void;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function startMarketplaceApi(
  opts: MarketplaceApiOptions
): Promise<RunningMarketplaceApi> {
  const logger = opts.logger ?? createLogger({ name: 'marketplace-api' });
  const store = opts.store ?? new InMemoryMarketplaceStore();
  const adminToken = opts.adminToken ?? '';

  const isAdmin = (header: string | undefined): boolean =>
    adminToken !== '' && header === adminToken;

  const server = createServer(async (req, res) => {
    try {
      if (!req.url) return send(res, 400, { error: 'no url' });
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return send(res, 200, { ok: true });
      }

      // GET /api/packs
      if (req.method === 'GET' && url.pathname === '/api/packs') {
        const tag = url.searchParams.get('tag') ?? undefined;
        const featured = url.searchParams.get('featured');
        const packs = await store.listPacks({
          tag,
          featured: featured === null ? undefined : featured === 'true',
        });
        return send(res, 200, { packs });
      }

      // GET /api/packs/:id  | POST /api/packs (admin)
      if (url.pathname === '/api/packs' && req.method === 'POST') {
        if (!isAdmin(req.headers['x-admin-token'] as string | undefined)) {
          return send(res, 401, { error: 'admin required' });
        }
        const body = JSON.parse(await readBody(req));
        const parsed = PackSchema.safeParse(body);
        if (!parsed.success) {
          return send(res, 400, { error: 'invalid pack' });
        }
        await store.savePack(parsed.data);
        return send(res, 200, { ok: true });
      }
      const packMatch = url.pathname.match(/^\/api\/packs\/([^/]+)(?:\/(.+))?$/);
      if (packMatch) {
        const packId = decodeURIComponent(packMatch[1]!);
        const sub = packMatch[2];
        if (req.method === 'GET' && !sub) {
          const pack = await store.getPack(packId);
          return pack ? send(res, 200, pack) : send(res, 404, { error: 'pack not found' });
        }
        if (req.method === 'POST' && sub === 'feature') {
          if (!isAdmin(req.headers['x-admin-token'] as string | undefined)) {
            return send(res, 401, { error: 'admin required' });
          }
          const body = JSON.parse(await readBody(req)) as { featured: boolean };
          await store.setFeatured(packId, !!body.featured);
          return send(res, 200, { ok: true });
        }
        if (sub === 'reviews') {
          if (req.method === 'GET') {
            return send(res, 200, { reviews: await store.listReviews(packId) });
          }
          if (req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            const parsed = ReviewSchema.safeParse({ ...body, packId });
            if (!parsed.success) return send(res, 400, { error: 'invalid review' });
            await store.addReview(parsed.data);
            return send(res, 200, { ok: true });
          }
        }
      }

      // Authors
      if (url.pathname === '/api/authors' && req.method === 'POST') {
        if (!isAdmin(req.headers['x-admin-token'] as string | undefined)) {
          return send(res, 401, { error: 'admin required' });
        }
        const body = JSON.parse(await readBody(req));
        const parsed = AuthorSchema.safeParse(body);
        if (!parsed.success) return send(res, 400, { error: 'invalid author' });
        await store.saveAuthor(parsed.data);
        return send(res, 200, { ok: true });
      }
      const authorMatch = url.pathname.match(/^\/api\/authors\/([^/]+)$/);
      if (authorMatch && req.method === 'GET') {
        const a = await store.getAuthor(decodeURIComponent(authorMatch[1]!));
        return a ? send(res, 200, a) : send(res, 404, { error: 'author not found' });
      }

      // Sales (admin)
      if (url.pathname === '/api/sales' && req.method === 'GET') {
        if (!isAdmin(req.headers['x-admin-token'] as string | undefined)) {
          return send(res, 401, { error: 'admin required' });
        }
        const sales = await store.listSales({
          packId: url.searchParams.get('packId') ?? undefined,
          authorId: url.searchParams.get('authorId') ?? undefined,
        });
        return send(res, 200, { sales });
      }

      // Checkout — stubbed until Stripe Connect wires P5.02d
      const checkoutMatch = url.pathname.match(/^\/api\/checkout\/([^/]+)$/);
      if (checkoutMatch && req.method === 'POST') {
        const packId = decodeURIComponent(checkoutMatch[1]!);
        const pack = await store.getPack(packId);
        if (!pack) return send(res, 404, { error: 'pack not found' });
        // Production: create Stripe Checkout Session with stripePriceId + transfer_data
        // Stub: return a deterministic-but-clearly-fake URL.
        return send(res, 200, {
          sessionUrl: `https://checkout.stripe.example/sess_${pack.id}_pending`,
          note: 'stub — wire Stripe Connect (owner-completed)',
        });
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      logger.warn({ err }, 'marketplace-api error');
      return send(res, 500, { error: 'internal' });
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port, () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;
  logger.info({ port }, 'marketplace-api listening');

  return {
    port,
    store,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

import { describe, it, expect } from 'vitest';
import {
  AuthorSchema,
  DEFAULT_REVENUE_SPLIT,
  InMemoryMarketplaceStore,
  PackSchema,
  ReviewSchema,
  SaleSchema,
  installPack,
  splitRevenue,
  type Author,
  type Pack,
} from '../index.js';

const mkAuthor = (over: Partial<Author> = {}): Author => ({
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Test',
  email: 't@x.com',
  stripeConnectId: 'acct_test',
  joinedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

const mkPack = (over: Partial<Pack> = {}): Pack => ({
  id: 'com.example.pack',
  name: 'Example pack',
  description: 'Test',
  authorId: mkAuthor().id,
  version: '1.0.0',
  priceUsdCents: 999,
  stripePriceId: 'price_test',
  bundleSha256: 'a'.repeat(64),
  bundleUrl: 'https://example.com/pack.zip',
  featured: false,
  tags: ['vlog'],
  publishedAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

describe('schemas (P5.02a)', () => {
  it('PackSchema validates a well-formed pack', () => {
    expect(() => PackSchema.parse(mkPack())).not.toThrow();
  });
  it('PackSchema rejects bad reverse-DNS id', () => {
    expect(() => PackSchema.parse(mkPack({ id: 'BAD ID' }))).toThrow();
  });
  it('PackSchema rejects non-semver version', () => {
    expect(() => PackSchema.parse(mkPack({ version: '1' }))).toThrow();
  });
  it('PackSchema rejects bad sha256', () => {
    expect(() => PackSchema.parse(mkPack({ bundleSha256: 'not-hex' }))).toThrow();
  });
  it('AuthorSchema rejects non-acct_ Stripe id', () => {
    expect(() => AuthorSchema.parse(mkAuthor({ stripeConnectId: 'cus_x' }))).toThrow();
  });
  it('AuthorSchema accepts empty Stripe id (pre-activation)', () => {
    expect(() => AuthorSchema.parse(mkAuthor({ stripeConnectId: '' }))).not.toThrow();
  });
  it('SaleSchema rejects negative amount', () => {
    expect(() =>
      SaleSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        packId: 'com.example.pack',
        buyerEmail: 'b@x.com',
        amountUsdCents: -1,
        authorShareCents: 0,
        platformShareCents: 0,
        soldAt: '2026-06-01T00:00:00.000Z',
      })
    ).toThrow();
  });
  it('ReviewSchema enforces 1..5 rating', () => {
    expect(() =>
      ReviewSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        packId: 'com.example.pack',
        authorEmail: 'a@x.com',
        rating: 6,
        body: 'nope',
        createdAt: '2026-06-01T00:00:00.000Z',
      })
    ).toThrow();
  });
});

describe('splitRevenue (P5.02d)', () => {
  it('uses default 70/30 split', () => {
    expect(splitRevenue(1000)).toEqual({ authorShareCents: 700, platformShareCents: 300 });
  });
  it('honours override pct', () => {
    expect(splitRevenue(1000, 80)).toEqual({ authorShareCents: 800, platformShareCents: 200 });
  });
  it('platform absorbs the rounding remainder', () => {
    expect(splitRevenue(999, 70)).toEqual({ authorShareCents: 699, platformShareCents: 300 });
    expect(DEFAULT_REVENUE_SPLIT.author + DEFAULT_REVENUE_SPLIT.platform).toBe(100);
  });
  it('handles zero', () => {
    expect(splitRevenue(0)).toEqual({ authorShareCents: 0, platformShareCents: 0 });
  });
});

describe('InMemoryMarketplaceStore', () => {
  it('save + list + filter by tag + featured', async () => {
    const store = new InMemoryMarketplaceStore();
    await store.savePack(mkPack({ id: 'com.a.one', tags: ['vlog'], featured: true }));
    await store.savePack(mkPack({ id: 'com.a.two', tags: ['cinematic'] }));
    expect((await store.listPacks()).length).toBe(2);
    expect((await store.listPacks({ tag: 'vlog' })).length).toBe(1);
    expect((await store.listPacks({ featured: true })).length).toBe(1);
  });
  it('setFeatured flips the flag', async () => {
    const store = new InMemoryMarketplaceStore();
    await store.savePack(mkPack({ id: 'com.x.p' }));
    await store.setFeatured('com.x.p', true);
    expect((await store.getPack('com.x.p'))?.featured).toBe(true);
  });
  it('listSales by author walks pack ownership', async () => {
    const store = new InMemoryMarketplaceStore();
    const author = mkAuthor();
    await store.saveAuthor(author);
    await store.savePack(mkPack({ id: 'com.x.a', authorId: author.id }));
    await store.recordSale({
      id: '22222222-2222-4222-8222-222222222222',
      packId: 'com.x.a',
      buyerEmail: 'b@x.com',
      amountUsdCents: 999,
      authorShareCents: 699,
      platformShareCents: 300,
      soldAt: '2026-06-01T00:00:00.000Z',
    });
    expect((await store.listSales({ authorId: author.id })).length).toBe(1);
    expect((await store.listSales({ authorId: 'other' })).length).toBe(0);
  });
});

describe('installPack (P5.02e)', () => {
  const okBytes = new TextEncoder().encode('FAKE').buffer as ArrayBuffer;
  const okHash = 'b'.repeat(64);

  it('happy path returns installed files', async () => {
    const res = await installPack(
      mkPack({ bundleSha256: okHash, bundleUrl: 'https://x/p.zip' }),
      '/tmp/x',
      {
        fetcher: async () => okBytes,
        hasher: async () => okHash,
        unzipper: async () => ['vlog.style', 'tech-reel.style'],
      }
    );
    expect(res.kind).toBe('installed');
    if (res.kind === 'installed') expect(res.installedFiles).toHaveLength(2);
  });

  it('sha mismatch returns the mismatch result', async () => {
    const res = await installPack(mkPack({ bundleSha256: 'a'.repeat(64) }), '/tmp/x', {
      fetcher: async () => okBytes,
      hasher: async () => 'c'.repeat(64),
      unzipper: async () => ['x'],
    });
    expect(res.kind).toBe('sha-mismatch');
  });

  it('fetch failure surfaces as error', async () => {
    const res = await installPack(mkPack(), '/tmp/x', {
      fetcher: async () => {
        throw new Error('network down');
      },
      hasher: async () => 'x',
      unzipper: async () => [],
    });
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.reason).toBe('network down');
  });
});

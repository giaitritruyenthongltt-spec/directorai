/**
 * P5.02a — In-memory marketplace store.
 *
 * Production swaps in a Postgres-backed store (lands with O Section
 * P5.06a or a dedicated marketplace-db package). The store
 * abstraction lets the API (P5.02b) be storage-agnostic.
 *
 * Operations:
 *   - listPacks / getPack
 *   - savePack (upsert)
 *   - listAuthors / getAuthor / saveAuthor
 *   - recordSale / listSales (by pack or author)
 *   - addReview / listReviews
 *   - setFeatured (curation)
 */
import type { Author, Pack, Review, Sale } from './schema.js';

export interface IMarketplaceStore {
  listPacks(opts?: { tag?: string; featured?: boolean }): Promise<readonly Pack[]>;
  getPack(id: string): Promise<Pack | null>;
  savePack(pack: Pack): Promise<void>;
  setFeatured(packId: string, featured: boolean): Promise<void>;

  listAuthors(): Promise<readonly Author[]>;
  getAuthor(id: string): Promise<Author | null>;
  saveAuthor(a: Author): Promise<void>;

  recordSale(s: Sale): Promise<void>;
  listSales(opts: { packId?: string; authorId?: string }): Promise<readonly Sale[]>;

  addReview(r: Review): Promise<void>;
  listReviews(packId: string): Promise<readonly Review[]>;
}

export class InMemoryMarketplaceStore implements IMarketplaceStore {
  private packs = new Map<string, Pack>();
  private authors = new Map<string, Author>();
  private sales: Sale[] = [];
  private reviews: Review[] = [];

  async listPacks(opts: { tag?: string; featured?: boolean } = {}): Promise<readonly Pack[]> {
    let out = [...this.packs.values()];
    if (opts.tag) out = out.filter((p) => p.tags.includes(opts.tag!));
    if (opts.featured !== undefined) out = out.filter((p) => p.featured === opts.featured);
    return out.sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1));
  }
  async getPack(id: string): Promise<Pack | null> {
    return this.packs.get(id) ?? null;
  }
  async savePack(pack: Pack): Promise<void> {
    this.packs.set(pack.id, pack);
  }
  async setFeatured(packId: string, featured: boolean): Promise<void> {
    const p = this.packs.get(packId);
    if (!p) return;
    this.packs.set(packId, { ...p, featured });
  }

  async listAuthors(): Promise<readonly Author[]> {
    return [...this.authors.values()];
  }
  async getAuthor(id: string): Promise<Author | null> {
    return this.authors.get(id) ?? null;
  }
  async saveAuthor(a: Author): Promise<void> {
    this.authors.set(a.id, a);
  }

  async recordSale(s: Sale): Promise<void> {
    this.sales.push(s);
  }
  async listSales(opts: { packId?: string; authorId?: string }): Promise<readonly Sale[]> {
    let out = [...this.sales];
    if (opts.packId) out = out.filter((s) => s.packId === opts.packId);
    if (opts.authorId) {
      const ownedPacks = new Set(
        Array.from(this.packs.values())
          .filter((p) => p.authorId === opts.authorId)
          .map((p) => p.id)
      );
      out = out.filter((s) => ownedPacks.has(s.packId));
    }
    return out;
  }

  async addReview(r: Review): Promise<void> {
    this.reviews.push(r);
  }
  async listReviews(packId: string): Promise<readonly Review[]> {
    return this.reviews.filter((r) => r.packId === packId);
  }
}

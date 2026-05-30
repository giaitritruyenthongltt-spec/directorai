/**
 * P4.35 — Waitlist persistence.
 *
 * Append-only JSONL store at $WAITLIST_PATH (default
 * ~/.directorai/waitlist.jsonl). Each signup is one line:
 *   {"email":"…","at":1700000000000,"source":"landing"}
 *
 * Append-only because:
 *  - duplicates are fine; we de-dupe on export to Mailgun/Postmark
 *  - JSONL is grep-friendly and survives partial writes
 *  - swap to Postgres at P5 without changing the writer API
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface WaitlistEntry {
  email: string;
  at: number;
  source: string;
  ip?: string;
}

const DEFAULT_PATH = path.join(os.homedir(), '.directorai', 'waitlist.jsonl');

export class WaitlistStore {
  constructor(private readonly file: string = DEFAULT_PATH) {}

  async append(entry: WaitlistEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.appendFile(this.file, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  async readAll(): Promise<WaitlistEntry[]> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      return raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l) as WaitlistEntry);
    } catch {
      return [];
    }
  }

  /** Latest count (deduped by email, lowercased). */
  async uniqueCount(): Promise<number> {
    const all = await this.readAll();
    return new Set(all.map((e) => e.email.toLowerCase())).size;
  }
}

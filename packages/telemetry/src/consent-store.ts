/**
 * P4.13 — Consent + install-id persistence.
 *
 * Stores at `~/.directorai/telemetry-consent.json`:
 *
 *   {
 *     "installId": "uuid",
 *     "consented": true | false | null,  // null = not yet asked
 *     "consentedAt": epoch | null,
 *     "deletedAt": epoch | null          // GDPR right-to-erasure marker
 *   }
 *
 * The file is the single source of truth. The server reads it on
 * boot to decide whether `TelemetryClient.isEnabled()` returns true.
 * The panel asks via the `telemetry.*` RPC namespace.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface ConsentRecord {
  installId: string;
  consented: boolean | null;
  consentedAt: number | null;
  deletedAt: number | null;
}

const DEFAULT_PATH = path.join(os.homedir(), '.directorai', 'telemetry-consent.json');

export class ConsentStore {
  constructor(private readonly file = DEFAULT_PATH) {}

  async read(): Promise<ConsentRecord> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      return JSON.parse(raw) as ConsentRecord;
    } catch {
      // First touch — generate an install id and persist a "not asked" record.
      const fresh: ConsentRecord = {
        installId: randomUUID(),
        consented: null,
        consentedAt: null,
        deletedAt: null,
      };
      await this.write(fresh);
      return fresh;
    }
  }

  async write(rec: ConsentRecord): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(rec, null, 2), 'utf8');
  }

  async setConsent(consented: boolean): Promise<ConsentRecord> {
    const cur = await this.read();
    const next: ConsentRecord = {
      ...cur,
      consented,
      consentedAt: Date.now(),
      deletedAt: consented ? cur.deletedAt : Date.now(),
    };
    await this.write(next);
    return next;
  }

  /** Mark deletion + reset consent. The caller is responsible for wiping the sink. */
  async requestDeletion(): Promise<ConsentRecord> {
    const cur = await this.read();
    const next: ConsentRecord = {
      ...cur,
      consented: false,
      deletedAt: Date.now(),
    };
    await this.write(next);
    return next;
  }
}

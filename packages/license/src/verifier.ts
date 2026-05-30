/**
 * P4.20 — Runtime verifier with offline grace period.
 *
 * The Verifier holds:
 *   - the public key (compiled in or loaded from disk)
 *   - the current license string (or null)
 *   - the timestamp of the last successful online activation
 *   - a `graceWindowMs` (default 7 days)
 *
 * `isValid()` returns true if:
 *   - the license signature verifies and isn't expired, AND
 *   - either the last online check was within the grace window, OR
 *     no online check is required (dev mode `offlineGraceMs = Infinity`).
 *
 * Production usage: hand the verifier a public key + load saved
 * license + last-online-check time from disk. The license-router RPC
 * exposes activate / status / refresh.
 */
import { verifyLicense, type VerifyResult } from './sign.js';
import type { LicensePayload } from './schema.js';

export interface VerifierState {
  licenseString: string | null;
  lastOnlineCheckAt: number | null;
}

export interface VerifierOptions {
  publicKeyPem: string;
  /** ms allowed between online checks before locking. Default 7d. */
  offlineGraceMs?: number;
  /** Inject a clock for tests. */
  now?: () => number;
}

export interface VerifierStatus extends VerifyResult {
  withinGrace: boolean;
  msSinceLastOnline: number | null;
}

const DEFAULT_GRACE = 7 * 24 * 60 * 60 * 1000;

export class LicenseVerifier {
  private state: VerifierState = { licenseString: null, lastOnlineCheckAt: null };

  constructor(private readonly opts: VerifierOptions) {}

  hydrate(state: VerifierState): void {
    this.state = { ...state };
  }

  snapshot(): VerifierState {
    return { ...this.state };
  }

  /** Record a successful online activation. Updates the grace clock. */
  recordOnlineActivation(licenseString: string): void {
    this.state = {
      licenseString,
      lastOnlineCheckAt: (this.opts.now ?? Date.now)(),
    };
  }

  /** Set the license without touching the online-check timestamp. */
  setLicense(licenseString: string | null): void {
    this.state = { ...this.state, licenseString };
  }

  status(): VerifierStatus {
    const now = (this.opts.now ?? Date.now)();
    if (!this.state.licenseString) {
      return {
        ok: false,
        reason: 'no license',
        withinGrace: false,
        msSinceLastOnline: null,
      };
    }
    const verifyRes = verifyLicense(this.state.licenseString, this.opts.publicKeyPem);
    const sinceOnline =
      this.state.lastOnlineCheckAt === null ? null : now - this.state.lastOnlineCheckAt;
    const graceMs = this.opts.offlineGraceMs ?? DEFAULT_GRACE;
    const withinGrace =
      this.state.lastOnlineCheckAt === null ? false : (sinceOnline as number) <= graceMs;
    return {
      ...verifyRes,
      withinGrace,
      msSinceLastOnline: sinceOnline,
    };
  }

  /** True if signature + expiry + grace all pass. */
  isValid(): boolean {
    const s = this.status();
    return s.ok && s.withinGrace;
  }

  payload(): LicensePayload | undefined {
    return this.status().payload;
  }
}

/**
 * P5.03d — Host-NLE factory.
 *
 * Picks the right `INLEAdapter` implementation given:
 *
 *   - explicit `host` arg (highest precedence)
 *   - `DIRECTORAI_NLE_HOST` env var (`uxp` / `davinci` / `mock`)
 *   - probe (`detectHostNLE`) — checks for Resolve install markers
 *   - falls back to mock
 *
 * The factory does NOT bring up a real bridge — that's the
 * caller's job (needs config + cleanup). It only returns the
 * adapter class + a hint about what host was detected. The
 * boot script in `apps/server/src/index.ts` decides what to do
 * with that info.
 */
import { MockPremiereAdapter, type INLEAdapter } from '@directorai/premiere-adapter';
import { MockDaVinciAdapter } from './mock.js';

export type NLEHost = 'uxp' | 'davinci' | 'mock';

export interface DetectOptions {
  /** Override env / probe. */
  readonly explicit?: NLEHost;
  /** Inject env for tests. */
  readonly env?: Record<string, string | undefined>;
  /** Probe injection for tests; in production it does real fs/registry checks. */
  readonly probe?: () => NLEHost | null;
}

/**
 * Decide which host we're talking to. Pure function — `probe` may
 * have side effects but everything else is in-memory. Used by the
 * server boot script + integration tests.
 */
export function detectHostNLE(opts: DetectOptions = {}): NLEHost {
  if (opts.explicit) return opts.explicit;
  const env = opts.env ?? (typeof process !== 'undefined' ? process.env : {});
  const fromEnv = env.DIRECTORAI_NLE_HOST;
  if (fromEnv === 'uxp' || fromEnv === 'davinci' || fromEnv === 'mock') {
    return fromEnv;
  }
  if (opts.probe) {
    const probed = opts.probe();
    if (probed) return probed;
  }
  return 'mock';
}

/**
 * Build a mock adapter for the chosen host. Used by tests + dev mode.
 * Production code wires the real UXP / DaVinci adapters separately
 * (UXP needs a panel connection, DaVinci needs a bridge subprocess);
 * the factory's job is to pick the *kind*, not own the wiring.
 */
export function createMockAdapterForHost(host: NLEHost): INLEAdapter {
  switch (host) {
    case 'davinci':
      return new MockDaVinciAdapter();
    case 'uxp':
    case 'mock':
    default:
      return new MockPremiereAdapter();
  }
}

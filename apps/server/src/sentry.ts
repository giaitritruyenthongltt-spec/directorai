/**
 * P4.09 — Sentry server-side init.
 *
 * Initialises @sentry/node when a DSN is configured. Re-exports a
 * single `captureException` helper that's a no-op when Sentry is off,
 * so callers don't need to guard.
 *
 * Production wiring: set `SENTRY_DSN` + `SENTRY_RELEASE` in env. Dev
 * mode leaves DSN empty → all calls are noops.
 */
import type { SentryConfig } from '@directorai/config';
import type { Logger } from '@directorai/shared';

interface SentryInitialised {
  readonly enabled: boolean;
  readonly captureException: (err: unknown, ctx?: Record<string, unknown>) => void;
  readonly flush: (timeoutMs?: number) => Promise<boolean>;
}

const noopCapture = (_err: unknown, _ctx?: Record<string, unknown>): void => void _err;
const noopFlush = (_timeoutMs?: number): Promise<boolean> => Promise.resolve(true);
const noop: SentryInitialised = {
  enabled: false,
  captureException: noopCapture,
  flush: noopFlush,
};

export async function initSentry(cfg: SentryConfig, logger: Logger): Promise<SentryInitialised> {
  if (!cfg.dsn) {
    logger.debug?.({}, 'Sentry disabled (no DSN)');
    return noop;
  }
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: cfg.dsn,
      tracesSampleRate: cfg.tracesSampleRate,
      release: cfg.release || undefined,
    });
    logger.info({ release: cfg.release }, 'Sentry initialised');
    return {
      enabled: true,
      captureException: (err, ctx) => {
        Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
      },
      flush: (timeoutMs) => Sentry.flush(timeoutMs ?? 2_000),
    };
  } catch (err) {
    logger.warn({ err }, 'Sentry init failed — continuing without it');
    return noop;
  }
}

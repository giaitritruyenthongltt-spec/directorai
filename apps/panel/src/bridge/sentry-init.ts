/**
 * P4.10 — Sentry panel-side init.
 *
 * Reads DSN from the build-time env or window-level config. If empty,
 * exposes a no-op `captureException`. Errors during init are
 * swallowed — telemetry must never crash the panel.
 */

const noopCapture = (_err: unknown): void => void _err;
let captureFn: (err: unknown) => void = noopCapture;
let isReady = false;

declare global {
  interface Window {
    __DIRECTORAI_SENTRY_DSN__?: string;
    __DIRECTORAI_RELEASE__?: string;
  }
}

export async function initPanelSentry(): Promise<void> {
  const dsn =
    (typeof window !== 'undefined' && window.__DIRECTORAI_SENTRY_DSN__) ||
    (typeof process !== 'undefined' ? process.env?.SENTRY_DSN : '');
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/browser');
    Sentry.init({
      dsn,
      release:
        (typeof window !== 'undefined' && window.__DIRECTORAI_RELEASE__) ||
        (typeof process !== 'undefined' ? process.env?.SENTRY_RELEASE : undefined),
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: 0.1,
    });
    captureFn = (err) => Sentry.captureException(err);
    isReady = true;
  } catch {
    // ignore
  }
}

export function captureException(err: unknown): void {
  captureFn(err);
}

export function sentryReady(): boolean {
  return isReady;
}

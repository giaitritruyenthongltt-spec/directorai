/**
 * V3 smoke test — confirm Sentry is reachable from this machine.
 *
 * Run AFTER:
 *   - You signed up at sentry.io and got two DSNs (server + panel).
 *   - Pasted into env:  SENTRY_DSN=https://...@sentry.io/...
 *
 *   pnpm smoke:sentry
 *
 * What it does:
 *   - Validates DSN shape (warns on suspicious values).
 *   - Initialises @sentry/node with the DSN.
 *   - Captures a test exception tagged release=smoke-test.
 *   - Awaits Sentry.flush(5s) so the event is sent before exit.
 *
 * Then go open the Sentry dashboard → search release:smoke-test.
 * Should appear within ~30s of running this script.
 */

async function main(): Promise<void> {
  const dsn = process.env.SENTRY_DSN ?? '';
  if (!dsn) {
    console.error('❌ SENTRY_DSN not set in env. Aborting.');
    console.error('   Sign up at https://sentry.io, copy DSN, set SENTRY_DSN, retry.');
    process.exit(1);
  }
  if (!/^https?:\/\/[a-z0-9]+@/i.test(dsn)) {
    console.warn(
      '⚠ SENTRY_DSN does not look like a valid Sentry DSN (expected https://<key>@<host>/<id>).'
    );
    console.warn('  Continuing anyway — the SDK will validate.');
  }

  let Sentry: typeof import('@sentry/node');
  try {
    Sentry = await import('@sentry/node');
  } catch (err) {
    console.error('❌ @sentry/node not available in this workspace:', err);
    console.error('   Run `pnpm install` first.');
    process.exit(1);
  }

  Sentry.init({
    dsn,
    release: process.env.SENTRY_RELEASE ?? 'smoke-test',
    tracesSampleRate: 0,
    environment: 'verification',
  });
  console.info('✔ Sentry init OK');

  const err = new Error('DirectorAI Sentry smoke test — please ignore');
  err.name = 'SmokeTestError';
  const id = Sentry.captureException(err, {
    tags: { source: 'tools/smoke-sentry.ts' },
  });
  console.info(`✔ captureException → event id ${id}`);

  process.stdout.write('Flushing … ');
  const flushed = await Sentry.flush(5_000);
  console.info(flushed ? 'sent.' : 'TIMEOUT (Sentry may be unreachable).');

  if (!flushed) {
    console.error('❌ Sentry flush returned false within 5s — check network + DSN.');
    process.exit(1);
  }
  console.info('');
  console.info('✅ PASS — open the Sentry dashboard and confirm');
  console.info('   release:smoke-test SmokeTestError appears within 30s.');
}

void main().catch((e) => {
  console.error('crashed:', e);
  process.exit(1);
});

/**
 * P4.13 — TelemetryClient.
 *
 * Single chokepoint for emitting events. Gates every emission on:
 *
 *   1. The catalog schema (unknown events throw at dev time, silently
 *      drop in prod).
 *   2. The current consent state (opt-out → never reaches the sink).
 *
 * Consent state is owned externally — pass a `() => boolean` getter so
 * the client can be created once and consult the latest preference
 * without subscription gymnastics.
 */
import { validateEvent, type TelemetryEvent } from './events.js';
import type { TelemetrySink } from './sink.js';

export interface TelemetryClientOptions {
  sink: TelemetrySink;
  /** Returns true when the user has opted in. */
  isEnabled: () => boolean;
  /** Optional logger for schema misses; defaults to console.warn. */
  onSchemaError?: (err: Error, raw: unknown) => void;
}

export class TelemetryClient {
  constructor(private readonly opts: TelemetryClientOptions) {}

  emit(evt: TelemetryEvent | Record<string, unknown>): void {
    if (!this.opts.isEnabled()) return;
    let validated: TelemetryEvent;
    try {
      validated = validateEvent(evt);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const handler = this.opts.onSchemaError ?? ((x) => console.warn('[telemetry]', x.message));
      handler(e, evt);
      return;
    }
    void Promise.resolve(this.opts.sink.emit(validated)).catch(() => {
      // sink failures are silent — telemetry must never crash the app
    });
  }

  /** Wipe stored events. P4.13 GDPR endpoint calls this. */
  async deleteAll(): Promise<void> {
    await this.opts.sink.clear();
  }
}

/**
 * P4.12 + P4.13 — Telemetry sinks.
 *
 * A `TelemetrySink` is the destination for validated events. Two
 * implementations ship:
 *
 *   - `NoopSink` — default when consent is not granted.
 *   - `InMemorySink` — for tests + the "show me what's stored locally"
 *     button in the consent panel (P4.13). Bounded ring buffer; the
 *     GDPR delete endpoint just `.clear()`s it.
 *
 * Production deployments plug their own sink (HTTPS POST, OpenTelemetry,
 * etc.). The TelemetryClient checks consent before every event so a
 * production sink never sees a thing if the user opted out.
 */
import type { TelemetryEvent } from './events.js';

export interface TelemetrySink {
  emit(evt: TelemetryEvent): void | Promise<void>;
  /** Wipe stored events (GDPR right-to-erasure). */
  clear(): void | Promise<void>;
}

export class NoopSink implements TelemetrySink {
  emit(): void {
    // no-op
  }
  clear(): void {
    // no-op
  }
}

export class InMemorySink implements TelemetrySink {
  private readonly buf: TelemetryEvent[] = [];
  constructor(private readonly capacity = 500) {}
  emit(evt: TelemetryEvent): void {
    this.buf.push(evt);
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity);
    }
  }
  clear(): void {
    this.buf.length = 0;
  }
  snapshot(): readonly TelemetryEvent[] {
    return [...this.buf];
  }
  get size(): number {
    return this.buf.length;
  }
}

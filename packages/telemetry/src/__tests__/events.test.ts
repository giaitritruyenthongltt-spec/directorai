import { describe, it, expect } from 'vitest';
import {
  TELEMETRY_EVENT_NAMES,
  validateEvent,
  TelemetryClient,
  InMemorySink,
  NoopSink,
} from '../index.js';

const baseFields = {
  installId: '00000000-0000-4000-8000-000000000000',
  ts: '2026-05-30T00:00:00.000Z',
  appVersion: '0.5.0',
  platform: 'win32' as const,
};

describe('telemetry catalog (P4.12)', () => {
  it('caps the catalog at 20 events', () => {
    expect(TELEMETRY_EVENT_NAMES.length).toBeLessThanOrEqual(20);
    expect(TELEMETRY_EVENT_NAMES.length).toBeGreaterThan(0);
  });

  it('accepts a well-formed event', () => {
    const parsed = validateEvent({
      ...baseFields,
      name: 'app.launched',
      coldStartMs: 1234,
    });
    expect(parsed.name).toBe('app.launched');
  });

  it('rejects an unknown event name', () => {
    expect(() => validateEvent({ ...baseFields, name: 'not.a.thing' })).toThrow(
      /Unknown telemetry event/
    );
  });

  it('rejects a known event with bad fields', () => {
    expect(() =>
      validateEvent({ ...baseFields, name: 'app.launched', coldStartMs: 'a' })
    ).toThrow();
  });
});

describe('TelemetryClient consent (P4.13)', () => {
  it('drops events when consent is off', () => {
    const sink = new InMemorySink();
    const client = new TelemetryClient({ sink, isEnabled: () => false });
    client.emit({ ...baseFields, name: 'app.launched' });
    expect(sink.size).toBe(0);
  });

  it('passes events through when consent is on', () => {
    const sink = new InMemorySink();
    const client = new TelemetryClient({ sink, isEnabled: () => true });
    client.emit({ ...baseFields, name: 'app.launched', coldStartMs: 42 });
    expect(sink.size).toBe(1);
  });

  it('schema errors are swallowed (telemetry never crashes the app)', () => {
    const sink = new InMemorySink();
    const errors: string[] = [];
    const client = new TelemetryClient({
      sink,
      isEnabled: () => true,
      onSchemaError: (e) => errors.push(e.message),
    });
    client.emit({ ...baseFields, name: 'app.launched', coldStartMs: -5 } as unknown as Record<
      string,
      unknown
    >);
    expect(sink.size).toBe(0);
    expect(errors.length).toBe(1);
  });

  it('deleteAll() empties the sink (GDPR right-to-erasure)', async () => {
    const sink = new InMemorySink();
    const client = new TelemetryClient({ sink, isEnabled: () => true });
    client.emit({ ...baseFields, name: 'app.launched' });
    client.emit({ ...baseFields, name: 'consent.opted_in' });
    expect(sink.size).toBe(2);
    await client.deleteAll();
    expect(sink.size).toBe(0);
  });

  it('NoopSink is a safe default', () => {
    const sink = new NoopSink();
    expect(() => sink.emit({} as never)).not.toThrow();
    expect(() => sink.clear()).not.toThrow();
  });
});

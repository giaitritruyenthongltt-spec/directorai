import { describe, it, expect } from 'vitest';
import {
  aggregateStyleStats,
  topStyles,
  recommendBySimilarity,
  recommendByCooccurrence,
} from '../index.js';
import type { TelemetryEvent } from '@directorai/telemetry';

const base = {
  installId: 'inst-1',
  ts: '2026-06-01T10:00:00.000Z',
  appVersion: '1.1.0',
  platform: 'win32' as const,
};

function applied(opts: {
  installId?: string;
  style: string;
  ts?: string;
  durationMs?: number;
  stepsError?: number;
}): TelemetryEvent {
  return {
    ...base,
    installId: opts.installId ?? base.installId,
    ts: opts.ts ?? base.ts,
    name: 'style.applied',
    style: opts.style,
    stepsOk: 10,
    stepsError: opts.stepsError ?? 0,
    durationMs: opts.durationMs ?? 1000,
  } as TelemetryEvent;
}

function dryRun(opts: { installId?: string; style: string; ts?: string }): TelemetryEvent {
  return {
    ...base,
    installId: opts.installId ?? base.installId,
    ts: opts.ts ?? base.ts,
    name: 'style.dryRun',
    style: opts.style,
    steps: 12,
  } as TelemetryEvent;
}

function patched(opts: { installId?: string; style: string }): TelemetryEvent {
  return {
    ...base,
    installId: opts.installId ?? base.installId,
    name: 'style.learner.patched',
    style: opts.style,
    patches: 2,
  } as TelemetryEvent;
}

describe('aggregateStyleStats (P5.09a)', () => {
  it('counts applies and computes mean duration + error rate', () => {
    const events = [
      applied({ style: 'vlog', durationMs: 1000 }),
      applied({ style: 'vlog', durationMs: 3000, stepsError: 1 }),
      applied({ style: 'vlog', durationMs: 2000 }),
      dryRun({ style: 'vlog' }),
      applied({ style: 'tech-reel', durationMs: 500 }),
    ];
    const stats = aggregateStyleStats(events);
    const vlog = stats.get('vlog')!;
    expect(vlog.applyCount).toBe(3);
    expect(vlog.dryRunCount).toBe(1);
    expect(vlog.meanDurationMs).toBe(2000);
    expect(vlog.errorRate).toBeCloseTo(1 / 3, 5);
    expect(stats.get('tech-reel')!.applyCount).toBe(1);
  });

  it('tracks unique installs and lastUsedAt', () => {
    const events = [
      applied({ style: 'vlog', installId: 'a', ts: '2026-06-01T10:00:00.000Z' }),
      applied({ style: 'vlog', installId: 'b', ts: '2026-06-02T10:00:00.000Z' }),
      applied({ style: 'vlog', installId: 'a', ts: '2026-06-03T10:00:00.000Z' }),
    ];
    const stats = aggregateStyleStats(events);
    const vlog = stats.get('vlog')!;
    expect(vlog.uniqueInstalls).toBe(2);
    expect(vlog.lastUsedAt).toBe(Date.parse('2026-06-03T10:00:00.000Z'));
  });

  it('ignores irrelevant events', () => {
    const stats = aggregateStyleStats([
      { ...base, name: 'app.launched', coldStartMs: 200 } as TelemetryEvent,
      { ...base, name: 'panel.connected', attempt: 1 } as TelemetryEvent,
      applied({ style: 'vlog' }),
    ]);
    expect(stats.size).toBe(1);
    expect(stats.get('vlog')!.applyCount).toBe(1);
  });

  it('counts learner patches separately', () => {
    const events = [
      applied({ style: 'vlog' }),
      patched({ style: 'vlog' }),
      patched({ style: 'vlog' }),
    ];
    const stats = aggregateStyleStats(events);
    expect(stats.get('vlog')!.learnerPatchCount).toBe(2);
  });

  it('handles empty input', () => {
    expect(aggregateStyleStats([]).size).toBe(0);
  });

  it('topStyles ranks by applyCount, tie-breaks by uniqueInstalls', () => {
    const events = [
      applied({ style: 'a', installId: 'i1' }),
      applied({ style: 'a', installId: 'i2' }),
      applied({ style: 'b', installId: 'i3' }),
      applied({ style: 'b', installId: 'i3' }),
      applied({ style: 'c', installId: 'i1' }),
      applied({ style: 'c', installId: 'i2' }),
      applied({ style: 'c', installId: 'i3' }),
    ];
    const stats = aggregateStyleStats(events);
    const top = topStyles(stats, 3);
    expect(top[0]!.name).toBe('c'); // 3 applies
    expect(top[1]!.name).toBe('a'); // 2 applies, 2 unique installs
    expect(top[2]!.name).toBe('b'); // 2 applies, 1 unique install
  });
});

describe('recommendations (P5.09b)', () => {
  // 3 installs:
  //   i1 → vlog, tech-reel
  //   i2 → vlog, tech-reel
  //   i3 → vlog, podcast
  const events: TelemetryEvent[] = [
    applied({ style: 'vlog', installId: 'i1' }),
    applied({ style: 'tech-reel', installId: 'i1' }),
    applied({ style: 'vlog', installId: 'i2' }),
    applied({ style: 'tech-reel', installId: 'i2' }),
    applied({ style: 'vlog', installId: 'i3' }),
    applied({ style: 'podcast', installId: 'i3' }),
  ];

  it('recommendBySimilarity picks tech-reel over podcast for vlog', () => {
    const recs = recommendBySimilarity(events, 'vlog', 5);
    expect(recs[0]!.style).toBe('tech-reel');
    // Jaccard(vlog, tech-reel) = 2 / 3 (intersection i1+i2; union i1+i2+i3)
    expect(recs[0]!.score).toBeCloseTo(2 / 3, 5);
    expect(recs[1]!.style).toBe('podcast');
    expect(recs[1]!.score).toBeCloseTo(1 / 3, 5);
  });

  it('recommendByCooccurrence uses raw counts not normalised', () => {
    const recs = recommendByCooccurrence(events, 'vlog', 5);
    expect(recs[0]).toEqual({ style: 'tech-reel', score: 2 });
    expect(recs[1]).toEqual({ style: 'podcast', score: 1 });
  });

  it('returns empty array for unknown source style', () => {
    expect(recommendBySimilarity(events, 'no-such-style')).toEqual([]);
    expect(recommendByCooccurrence(events, 'no-such-style')).toEqual([]);
  });

  it('filters out the source style itself', () => {
    const recs = recommendBySimilarity(events, 'vlog', 5);
    expect(recs.find((r) => r.style === 'vlog')).toBeUndefined();
  });

  it('skips events that are not style.applied', () => {
    const noise: TelemetryEvent[] = [
      ...events,
      dryRun({ style: 'cinematic', installId: 'i4' }),
      patched({ style: 'tutorial', installId: 'i4' }),
    ];
    const recs = recommendBySimilarity(noise, 'vlog', 10);
    // Neither cinematic nor tutorial should appear — no install
    // actually APPLIED them with vlog.
    expect(recs.find((r) => r.style === 'cinematic')).toBeUndefined();
    expect(recs.find((r) => r.style === 'tutorial')).toBeUndefined();
  });
});

/**
 * P1 — Unit tests for CompositeTools.
 *
 * scanClips + cutOnBeats are pure-adapter so they're testable without
 * the sidecar. scoreQuality + detectBeats + detectSilences hit the
 * sidecar via fetch — those branches are covered by mocking globalThis.fetch.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLogger } from '@directorai/shared';
import { MockPremiereAdapter } from '@directorai/premiere-adapter';
import { CompositeTools } from '../director-tools.js';

const logger = createLogger({ name: 'test', level: 'error' });

async function seed(adapter: MockPremiereAdapter): Promise<void> {
  // The mock adapter ships with a sample sequence + one clip on V1 (see
  // packages/premiere-adapter/src/mock.ts).  Import another clip so we
  // have two on the timeline for cut-on-beats logic.
  await adapter.importFile({ path: 'C:\\b.mp4' });
}

describe('CompositeTools.scanClips', () => {
  let adapter: MockPremiereAdapter;
  let tools: CompositeTools;

  beforeEach(async () => {
    adapter = new MockPremiereAdapter();
    await seed(adapter);
    tools = new CompositeTools({ adapter, logger });
  });

  it('lists every clip without ranking when rankByQuality is omitted', async () => {
    const result = await tools.scanClips({});
    expect(result.ranked).toBe(false);
    expect(result.count).toBeGreaterThan(0);
    expect(result.clips.every((c) => c.quality === undefined)).toBe(true);
  });

  it('respects topN', async () => {
    const result = await tools.scanClips({ topN: 1 });
    expect(result.clips.length).toBe(1);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it('ranks clips by composite quality when rankByQuality is true', async () => {
    // Mock sidecar fetch — return increasing composite scores so clip
    // order ends up reverse of input.
    let counter = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              path: 'x',
              duration_sec: 5,
              width: 1920,
              height: 1080,
              fps: 30,
              codec: 'h264',
              sample_count: 5,
              elapsed_ms: 10,
              quality: {
                blur: 0,
                exposure: 0,
                focus: 0,
                framing: 0,
                composite: ++counter,
              },
            }),
        } as unknown as Response)
      )
    );

    const result = await tools.scanClips({ rankByQuality: true });
    expect(result.ranked).toBe(true);
    // Highest quality first
    const qualities = result.clips.map((c) => c.quality ?? -1);
    for (let i = 0; i < qualities.length - 1; i++) {
      expect(qualities[i]).toBeGreaterThanOrEqual(qualities[i + 1]!);
    }
    vi.unstubAllGlobals();
  });
});

describe('CompositeTools.detectBeats', () => {
  let tools: CompositeTools;

  beforeEach(() => {
    tools = new CompositeTools({ adapter: new MockPremiereAdapter(), logger });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards audioPath to /beats and returns tempo + beats', async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tempo_bpm: 120, beats_sec: [0.5, 1.0, 1.5] }),
      } as unknown as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    const r = await tools.detectBeats({ audioPath: '/music.wav' });
    expect(r.tempo_bpm).toBe(120);
    expect(r.beats_sec).toEqual([0.5, 1.0, 1.5]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/beats$/);
    expect(JSON.parse((init as { body: string }).body)).toEqual({ media_path: '/music.wav' });
  });

  it('requires audioPath', async () => {
    await expect(tools.detectBeats({ audioPath: '' })).rejects.toThrow(/audioPath/);
  });
});

describe('CompositeTools.detectSilences', () => {
  let tools: CompositeTools;

  beforeEach(() => {
    tools = new CompositeTools({ adapter: new MockPremiereAdapter(), logger });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hits /audio/silences and returns intervals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              media_path: '/m.wav',
              silences: [
                { start: 1.0, end: 1.5 },
                { start: 3.2, end: 4.0 },
              ],
            }),
        } as unknown as Response)
      )
    );
    const r = await tools.detectSilences({ audioPath: '/m.wav' });
    expect(r.silences.length).toBe(2);
    expect(r.silences[0]).toEqual({ start: 1.0, end: 1.5 });
  });
});

describe('CompositeTools.cutOnBeats', () => {
  let adapter: MockPremiereAdapter;
  let tools: CompositeTools;
  let seqId: string;

  beforeEach(async () => {
    adapter = new MockPremiereAdapter();
    await seed(adapter);
    tools = new CompositeTools({ adapter, logger });
    const seq = await adapter.getActiveSequence();
    if (!seq) throw new Error('no sequence');
    seqId = seq.id;
  });

  it('rejects when beats array is empty', async () => {
    await expect(tools.cutOnBeats({ sequenceId: seqId, beats: [] })).rejects.toThrow(/beats/);
  });

  it('finds clip under each beat and cuts it', async () => {
    const clips = await adapter.listClips(seqId);
    const firstClip = clips.find((c) => c.kind === 'video')!;
    const midPoint = (firstClip.timelineRange.start + firstClip.timelineRange.end) / 2;

    const r = await tools.cutOnBeats({ sequenceId: seqId, beats: [midPoint] });
    expect(r.cuts).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.details[0]?.clipId).toBeDefined();
    expect(r.details[0]?.ok).toBe(true);
  });

  it('skips beats outside any clip', async () => {
    const r = await tools.cutOnBeats({
      sequenceId: seqId,
      beats: [9999], // way past any clip
    });
    expect(r.cuts).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.details[0]?.reason).toMatch(/no clip/i);
  });

  it('skips beats within 1 frame of clip edges', async () => {
    const clips = await adapter.listClips(seqId);
    const firstClip = clips.find((c) => c.kind === 'video')!;
    const r = await tools.cutOnBeats({
      sequenceId: seqId,
      beats: [firstClip.timelineRange.start + 0.001],
    });
    expect(r.cuts).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.details[0]?.reason).toMatch(/edge/);
  });
});

describe('CompositeTools.maybeHandle', () => {
  it('returns null for unknown method (caller falls through to primitive)', async () => {
    const tools = new CompositeTools({ adapter: new MockPremiereAdapter(), logger });
    const result = await tools.maybeHandle('project.get', {});
    expect(result).toBeNull();
  });

  it('routes known composite methods', async () => {
    const tools = new CompositeTools({ adapter: new MockPremiereAdapter(), logger });
    const result = await tools.maybeHandle('context.scanClips', {});
    expect(result).not.toBeNull();
    expect((result as { count: number }).count).toBeGreaterThanOrEqual(0);
  });
});

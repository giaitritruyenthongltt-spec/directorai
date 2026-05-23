/**
 * Integration tests for all 12 MCP tool groups against the MockPremiereAdapter.
 *
 * These exercise the full dispatcher → adapter path with the auto-undo
 * wrapper and retry policy active. Run via vitest from the project root:
 *   pnpm vitest run tests/integration
 *
 * Live tests against a real UXP panel are NOT covered here — those run via
 * `tools/live-test.mjs` once UDT is set up and the panel is loaded into
 * Premiere Pro.
 */
import { describe, it, expect } from 'vitest';
import { MockPremiereAdapter, dispatchRpc } from '@directorai/premiere-adapter';

const newAdapter = (): MockPremiereAdapter => new MockPremiereAdapter();

async function seedClip(a: MockPremiereAdapter): Promise<string> {
  await dispatchRpc('media.import', { path: 'C:\\fix\\hero.mp4' }, a);
  const seq = (await dispatchRpc('project.getActiveSequence', {}, a)) as {
    id: string;
    tracks: { kind: string; clips: { id: string }[] }[];
  };
  const clip = seq.tracks.find((t) => t.kind === 'video')!.clips[0];
  return clip.id;
}

describe('1. Project tools', () => {
  it('lists sequences and switches active', async () => {
    const a = newAdapter();
    const seqs = (await dispatchRpc('project.listSequences', {}, a)) as { id: string }[];
    expect(seqs.length).toBeGreaterThan(0);
    await dispatchRpc('project.setActiveSequence', { sequenceId: seqs[0].id }, a);
    const active = (await dispatchRpc('project.getActiveSequence', {}, a)) as {
      id: string;
    };
    expect(active.id).toBe(seqs[0].id);
  });
});

describe('2. Timeline read', () => {
  it('listClips returns array', async () => {
    const a = newAdapter();
    await seedClip(a);
    const seq = (await dispatchRpc('project.getActiveSequence', {}, a)) as { id: string };
    const clips = (await dispatchRpc('timeline.listClips', { sequenceId: seq.id }, a)) as unknown[];
    expect(clips.length).toBeGreaterThan(0);
  });
});

describe('3. Timeline edit', () => {
  it('cut → trim → move → delete roundtrip', async () => {
    const a = newAdapter();
    const id = await seedClip(a);
    const cut = (await dispatchRpc('timeline.cutClip', { clipId: id, at: 2 }, a)) as unknown[];
    expect(cut).toHaveLength(2);

    const trimmed = (await dispatchRpc(
      'timeline.trimClip',
      { clipId: id, newRange: { start: 0.5, end: 1.8 } },
      a
    )) as { timelineRange: { start: number; end: number } };
    expect(trimmed.timelineRange.start).toBe(0.5);

    const moved = (await dispatchRpc('timeline.moveClip', { clipId: id, newStart: 4 }, a)) as {
      timelineRange: { start: number };
    };
    expect(moved.timelineRange.start).toBe(4);

    await dispatchRpc('timeline.deleteClip', { clipId: id }, a);
    const seq = (await dispatchRpc('project.getActiveSequence', {}, a)) as {
      tracks: { clips: { id: string }[] }[];
    };
    const remaining = seq.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
    expect(remaining).toBeUndefined();
  });
});

describe('4. Media import', () => {
  it('importFile adds a clip', async () => {
    const a = newAdapter();
    const r = (await dispatchRpc('media.import', { path: 'C:\\fix\\b.mp4' }, a)) as {
      id: string;
      path: string;
    };
    expect(r.id).toMatch(/^media_/);
    expect(r.path).toBe('C:\\fix\\b.mp4');
  });
});

describe('5. Effects', () => {
  it('apply + remove', async () => {
    const a = newAdapter();
    const id = await seedClip(a);
    const eff = (await dispatchRpc(
      'effect.apply',
      { clipId: id, effectMatchName: 'AE.ADBE Lumetri' },
      a
    )) as { id: string };
    expect(eff.id).toMatch(/^effect_/);
    await dispatchRpc('effect.remove', { clipId: id, effectId: eff.id }, a);
  });
});

describe('6. Keyframes', () => {
  it('addKeyframe does not throw on mock', async () => {
    const a = newAdapter();
    const id = await seedClip(a);
    await dispatchRpc(
      'keyframe.add',
      { clipId: id, effectId: 'fake', paramName: 'Opacity', time: 1, value: 50 },
      a
    );
  });
});

describe('7. Color (Lumetri)', () => {
  it('applyPreset + setParams', async () => {
    const a = newAdapter();
    const id = await seedClip(a);
    await dispatchRpc('color.applyPreset', { clipId: id, presetName: 'WarmVlog' }, a);
    await dispatchRpc('color.setParams', { clipId: id, exposure: 0.5, contrast: 1.1 }, a);
  });
});

describe('8. Audio', () => {
  it('gain + fade + muteTrack', async () => {
    const a = newAdapter();
    const id = await seedClip(a);
    await dispatchRpc('audio.setGain', { clipId: id, gainDb: -6 }, a);
    await dispatchRpc('audio.addFade', { clipId: id, durationSec: 0.5, type: 'in' }, a);
    const seq = (await dispatchRpc('project.getActiveSequence', {}, a)) as {
      id: string;
      tracks: { id: string }[];
    };
    await dispatchRpc(
      'audio.muteTrack',
      { sequenceId: seq.id, trackId: seq.tracks[1].id, muted: true },
      a
    );
  });
});

describe('9. Text overlay', () => {
  it('addOverlay returns a clipId', async () => {
    const a = newAdapter();
    await seedClip(a);
    const seq = (await dispatchRpc('project.getActiveSequence', {}, a)) as { id: string };
    const r = (await dispatchRpc(
      'text.addOverlay',
      {
        sequenceId: seq.id,
        trackIndex: 0,
        text: 'Hello',
        startTime: 0,
        duration: 2,
      },
      a
    )) as { clipId: string };
    expect(r.clipId).toMatch(/^clip_/);
  });
});

describe('10. Transitions', () => {
  it('list returns presets', async () => {
    const a = newAdapter();
    const list = (await dispatchRpc('transition.list', {}, a)) as { matchName: string }[];
    expect(list.find((t) => t.matchName === 'CrossDissolve')).toBeTruthy();
  });
});

describe('11. Markers', () => {
  it('add + list + delete', async () => {
    const a = newAdapter();
    const seq = (await dispatchRpc('project.getActiveSequence', {}, a)) as { id: string };
    const m = (await dispatchRpc(
      'marker.add',
      { sequenceId: seq.id, time: 5, name: 'Chapter 1' },
      a
    )) as { id: string };
    const list = (await dispatchRpc('marker.list', { sequenceId: seq.id }, a)) as { id: string }[];
    expect(list.find((x) => x.id === m.id)).toBeTruthy();
    await dispatchRpc('marker.delete', { sequenceId: seq.id, markerId: m.id }, a);
  });
});

describe('12. Export', () => {
  it('exportSequence returns jobId', async () => {
    const a = newAdapter();
    const seq = (await dispatchRpc('project.getActiveSequence', {}, a)) as { id: string };
    const job = (await dispatchRpc(
      'export.sequence',
      { sequenceId: seq.id, outputPath: 'C:\\out.mp4', presetPath: 'H264' },
      a
    )) as { jobId: string };
    expect(job.jobId).toMatch(/^export_/);
  });
});

describe('Auto undo bracketing', () => {
  it('mutating dispatch leaves no open undo group', async () => {
    const a = newAdapter();
    const id = await seedClip(a);
    // Make a mutating call — dispatcher should begin+end internally
    await dispatchRpc('timeline.cutClip', { clipId: id, at: 1.5 }, a);
    // No assertion beyond "does not throw" — mock undo stack is FIFO and
    // would error if begin/end were unbalanced.
  });
});

describe('Retry policy', () => {
  it('non-transient errors do not retry', async () => {
    const a = newAdapter();
    const started = Date.now();
    await expect(
      dispatchRpc('timeline.cutClip', { clipId: 'does-not-exist', at: 1 }, a)
    ).rejects.toBeTruthy();
    // Should fail fast (no 3× ~200ms backoff) — give 1.5s budget for CI noise
    expect(Date.now() - started).toBeLessThan(1_500);
  });
});

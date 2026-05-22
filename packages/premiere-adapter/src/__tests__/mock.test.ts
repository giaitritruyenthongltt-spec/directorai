import { describe, it, expect, beforeEach } from 'vitest';
import { MockPremiereAdapter } from '../mock.js';
import { seconds } from '@directorai/core';

describe('MockPremiereAdapter', () => {
  let adapter: MockPremiereAdapter;
  beforeEach(() => {
    adapter = new MockPremiereAdapter();
  });

  it('seeds with a sample sequence by default', async () => {
    const seqs = await adapter.listSequences();
    expect(seqs.length).toBe(1);
    expect(seqs[0]!.name).toBe('Sample Sequence');
  });

  it('imports a file and adds a clip to V1', async () => {
    const { id, path } = await adapter.importFile({ path: 'C:\\test\\foo.mp4' });
    expect(id).toMatch(/^media_/);
    expect(path).toBe('C:\\test\\foo.mp4');
    const seq = await adapter.getActiveSequence();
    expect(seq!.tracks.find((t) => t.kind === 'video')!.clips.length).toBe(1);
  });

  it('cuts a clip into two', async () => {
    await adapter.importFile({ path: 'a.mp4' });
    const seq = await adapter.getActiveSequence();
    const clip = seq!.tracks.find((t) => t.kind === 'video')!.clips[0]!;
    const result = await adapter.cutClip({ clipId: clip.id, at: seconds(2) });
    expect(result.length).toBe(2);
    expect(result[0]!.timelineRange.end).toBe(2);
    expect(result[1]!.timelineRange.start).toBe(2);
  });

  it('refuses cut outside clip range', async () => {
    await adapter.importFile({ path: 'a.mp4' });
    const seq = await adapter.getActiveSequence();
    const clip = seq!.tracks.find((t) => t.kind === 'video')!.clips[0]!;
    await expect(adapter.cutClip({ clipId: clip.id, at: seconds(100) })).rejects.toThrow();
  });

  it('deletes a clip', async () => {
    await adapter.importFile({ path: 'a.mp4' });
    const seq = await adapter.getActiveSequence();
    const clip = seq!.tracks.find((t) => t.kind === 'video')!.clips[0]!;
    await adapter.deleteClip(clip.id);
    const after = await adapter.listClips(seq!.id);
    expect(after.length).toBe(0);
  });

  it('adds and lists markers', async () => {
    const seq = await adapter.getActiveSequence();
    await adapter.addMarker({ sequenceId: seq!.id, time: seconds(10), name: 'beat1' });
    await adapter.addMarker({ sequenceId: seq!.id, time: seconds(20), name: 'beat2' });
    const markers = await adapter.listMarkers(seq!.id);
    expect(markers.length).toBe(2);
    expect(markers[0]!.name).toBe('beat1');
  });

  it('applies and removes an effect', async () => {
    await adapter.importFile({ path: 'a.mp4' });
    const seq = await adapter.getActiveSequence();
    const clip = seq!.tracks.find((t) => t.kind === 'video')!.clips[0]!;
    const effect = await adapter.applyEffect({
      clipId: clip.id,
      effectMatchName: 'ADBE Gaussian Blur',
    });
    expect(effect.matchName).toBe('ADBE Gaussian Blur');
    const updated = await adapter.getClip(clip.id);
    expect(updated!.effects.length).toBe(1);
    await adapter.removeEffect(clip.id, effect.id);
    const after = await adapter.getClip(clip.id);
    expect(after!.effects.length).toBe(0);
  });

  it('supports undo group lifecycle', async () => {
    await adapter.beginUndoGroup('test');
    await adapter.endUndoGroup();
    expect(true).toBe(true);
  });
});

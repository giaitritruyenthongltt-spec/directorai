import { describe, it, expect, beforeEach } from 'vitest';
import { MockPremiereAdapter } from '@directorai/premiere-adapter';
import { dispatchRpc, listRpcMethods } from '../rpc-dispatcher.js';

describe('rpc-dispatcher', () => {
  let adapter: MockPremiereAdapter;
  beforeEach(() => {
    adapter = new MockPremiereAdapter();
  });

  it('lists at least 15 methods', () => {
    expect(listRpcMethods().length).toBeGreaterThanOrEqual(15);
  });

  it('project.get returns metadata', async () => {
    const result = (await dispatchRpc('project.get', {}, adapter)) as {
      metadata: { name: string };
    };
    expect(result.metadata.name).toBe('Mock Project');
  });

  it('project.listSequences returns sample', async () => {
    const result = (await dispatchRpc('project.listSequences', {}, adapter)) as unknown[];
    expect(result.length).toBe(1);
  });

  it('media.import + timeline.cutClip works end-to-end', async () => {
    await dispatchRpc('media.import', { path: 'C:\\sample.mp4' }, adapter);
    const seq = (await dispatchRpc('project.getActiveSequence', {}, adapter)) as {
      tracks: { kind: string; clips: { id: string }[] }[];
    };
    const videoTrack = seq.tracks.find((t) => t.kind === 'video')!;
    const clipId = videoTrack.clips[0]!.id;
    const cut = (await dispatchRpc('timeline.cutClip', { clipId, at: 2 }, adapter)) as unknown[];
    expect(cut.length).toBe(2);
  });

  it('throws on unknown method', async () => {
    await expect(dispatchRpc('nope.foo', {}, adapter)).rejects.toThrow(/Unknown RPC method/);
  });

  it('rejects invalid params via zod', async () => {
    await expect(dispatchRpc('timeline.cutClip', { clipId: 'x' }, adapter)).rejects.toThrow();
  });
});

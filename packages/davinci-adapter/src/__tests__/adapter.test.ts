import { describe, it, expect } from 'vitest';
import {
  MockDaVinciAdapter,
  MockDaVinciBridge,
  DaVinciAdapter,
  detectHostNLE,
  createMockAdapterForHost,
  type BridgeRequest,
} from '../index.js';

describe('MockDaVinciAdapter (P5.03b)', () => {
  it('reports kind = "davinci"', () => {
    const a = new MockDaVinciAdapter();
    expect(a.kind).toBe('davinci');
  });

  it('behaves like the Premiere mock — getProject returns metadata', async () => {
    const a = new MockDaVinciAdapter();
    const proj = await a.getProject();
    expect(proj.metadata.name).toBeTruthy();
  });

  it('full edit flow round-trips through the mock', async () => {
    const a = new MockDaVinciAdapter();
    const imported = await a.importFile({ path: 'C:/sample.mp4' });
    expect(imported.id).toBeTruthy();
    const seq = await a.getActiveSequence();
    expect(seq).not.toBeNull();
    const videoTrack = seq!.tracks.find((t) => t.kind === 'video')!;
    expect(videoTrack.clips.length).toBeGreaterThan(0);
  });
});

describe('DaVinciAdapter bridge integration (P5.03c)', () => {
  it('routes invoke through the bridge with sequential ids', async () => {
    const bridge = new MockDaVinciBridge();
    const a = new DaVinciAdapter({ bridge });
    await a.getProject();
    await a.listSequences();
    expect(bridge.received).toHaveLength(2);
    expect(bridge.received[0]!.id).toBe(1);
    expect(bridge.received[0]!.method).toBe('project.get');
    expect(bridge.received[1]!.id).toBe(2);
    expect(bridge.received[1]!.method).toBe('project.listSequences');
  });

  it('forwards method params correctly', async () => {
    const bridge = new MockDaVinciBridge((req) => ({
      id: req.id,
      ok: true,
      result: [{ id: 'clip-1' }],
    }));
    const a = new DaVinciAdapter({ bridge });
    await a.cutClip({ clipId: 'x', at: 5 as never });
    expect(bridge.received[0]!.method).toBe('timeline.cutClip');
    expect(bridge.received[0]!.params).toEqual({ clipId: 'x', at: 5 });
  });

  it('throws when the bridge reports failure', async () => {
    const bridge = new MockDaVinciBridge((req) => ({
      id: req.id,
      ok: false,
      error: 'boom',
    }));
    const a = new DaVinciAdapter({ bridge });
    await expect(a.getProject()).rejects.toThrow(/project\.get failed: boom/);
  });

  it('close() shuts the bridge and subsequent calls fail', async () => {
    const bridge = new MockDaVinciBridge();
    const a = new DaVinciAdapter({ bridge });
    await a.close();
    await expect(a.getProject()).rejects.toThrow(/bridge closed/);
  });

  it('every INLEAdapter method translates to its dotted RPC name', async () => {
    const bridge = new MockDaVinciBridge();
    const a = new DaVinciAdapter({ bridge });
    await a.getProject();
    await a.listSequences();
    await a.setActiveSequence('s1');
    await a.getActiveSequence();
    await a.listClips('s1');
    await a.getClip('c1');
    await a.listTracks('s1');
    await a.cutClip({ clipId: 'c1', at: 1 as never });
    await a.deleteClip('c1');
    await a.applyEffect({ clipId: 'c1', effectMatchName: 'x' });
    await a.removeEffect('c1', 'e1');
    await a.importFile({ path: 'p' });
    await a.addMarker({
      sequenceId: 's1',
      time: 0 as never,
      name: 'm',
    });
    await a.listMarkers('s1');
    await a.deleteMarker('s1', 'm');
    await a.exportSequence({ sequenceId: 's1', outputPath: 'o', presetPath: 'p' });
    await a.applyColorPreset('c1', 'p');
    await a.setAudioGain({ clipId: 'c1', gainDb: -3 });
    await a.listTransitions();
    await a.beginUndoGroup('x');
    await a.endUndoGroup();

    const methods = bridge.received.map((r: BridgeRequest) => r.method);
    expect(methods).toContain('project.get');
    expect(methods).toContain('timeline.cutClip');
    expect(methods).toContain('export.sequence');
    expect(methods).toContain('undo.begin');
    expect(methods).toContain('undo.end');
    // 21 RPCs invoked
    expect(methods.length).toBeGreaterThanOrEqual(20);
  });
});

describe('detectHostNLE + factory (P5.03d)', () => {
  it('explicit arg wins over env + probe', () => {
    expect(
      detectHostNLE({
        explicit: 'davinci',
        env: { DIRECTORAI_NLE_HOST: 'uxp' },
        probe: () => 'mock',
      })
    ).toBe('davinci');
  });

  it('env wins over probe', () => {
    expect(detectHostNLE({ env: { DIRECTORAI_NLE_HOST: 'davinci' }, probe: () => 'uxp' })).toBe(
      'davinci'
    );
  });

  it('probe wins over default when env empty', () => {
    expect(detectHostNLE({ env: {}, probe: () => 'davinci' })).toBe('davinci');
  });

  it('falls back to mock when nothing is set', () => {
    expect(detectHostNLE({ env: {} })).toBe('mock');
  });

  it('rejects unknown env values + falls through', () => {
    expect(detectHostNLE({ env: { DIRECTORAI_NLE_HOST: 'sony-vegas' } })).toBe('mock');
  });

  it('createMockAdapterForHost returns the right kind', () => {
    expect(createMockAdapterForHost('mock').kind).toBe('mock');
    expect(createMockAdapterForHost('uxp').kind).toBe('mock'); // mock fallback for uxp test mode
    expect(createMockAdapterForHost('davinci').kind).toBe('davinci');
  });
});

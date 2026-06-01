/**
 * A.3 — StyleFormEditor pure helpers test.
 *
 * Validates the YAML <-> form round trip without React rendering.
 * The component itself ships in `StyleFormEditor.tsx`; the form
 * fields are a thin wrapper over the same state shape.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_FORM_STATE, formFromYaml, yamlFromForm } from '../StyleFormEditor.js';

describe('StyleFormEditor helpers (A.3)', () => {
  it('yamlFromForm emits valid YAML with all sections', () => {
    const yaml = yamlFromForm(DEFAULT_FORM_STATE);
    expect(yaml).toContain('name: my-style');
    expect(yaml).toContain('removeSilence: true');
    expect(yaml).toContain('pacing:');
    expect(yaml).toContain('  hook:');
    expect(yaml).toContain('    durationSec: 3');
    expect(yaml).toContain('  body:');
    expect(yaml).toContain('    beatSync: false');
    expect(yaml).toContain('audio:');
    expect(yaml).toContain('  musicGainDb: -14');
    // colorPreset is empty by default → no color block
    expect(yaml).not.toContain('color:');
  });

  it('yamlFromForm includes color block when preset is set', () => {
    const yaml = yamlFromForm({ ...DEFAULT_FORM_STATE, colorPreset: 'WarmVlog' });
    expect(yaml).toContain('color:');
    expect(yaml).toContain('  preset: WarmVlog');
  });

  it('formFromYaml round-trips the default state', () => {
    const yaml = yamlFromForm(DEFAULT_FORM_STATE);
    const back = formFromYaml(yaml);
    expect(back).toEqual(DEFAULT_FORM_STATE);
  });

  it('formFromYaml round-trips a non-default state', () => {
    const state = {
      ...DEFAULT_FORM_STATE,
      name: 'punchy-vlog',
      hookCutsPerSec: 3.5,
      bodyCutsPerSec: 1.2,
      beatSync: true,
      colorPreset: 'TealOrange',
      audioMusicGainDb: -16.5,
      audioDuckingDb: -10,
    };
    const yaml = yamlFromForm(state);
    expect(formFromYaml(yaml)).toEqual(state);
  });

  it('formFromYaml falls back to defaults when fields are missing', () => {
    const partial = 'name: minimal\n';
    const back = formFromYaml(partial);
    expect(back.name).toBe('minimal');
    expect(back.hookCutsPerSec).toBe(DEFAULT_FORM_STATE.hookCutsPerSec);
    expect(back.beatSync).toBe(DEFAULT_FORM_STATE.beatSync);
  });

  it('formFromYaml ignores malformed numbers', () => {
    const bad = 'name: x\npacing:\n  hook:\n    cutsPerSec: not-a-number\n';
    const back = formFromYaml(bad);
    expect(back.hookCutsPerSec).toBe(DEFAULT_FORM_STATE.hookCutsPerSec);
  });
});

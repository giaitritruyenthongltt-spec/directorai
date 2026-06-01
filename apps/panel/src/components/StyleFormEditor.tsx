/**
 * A.3 (Track A debt) — Style form editor.
 *
 * Per-field form controls for the Style DSL, sitting alongside the
 * existing YAML textarea in `StylePicker.tsx`. The two views stay
 * in sync via `yamlFromForm` / `formFromYaml` — edits in one show
 * up in the other when the user toggles modes.
 *
 * Coverage: the 6 most-tweaked knobs. Less-common fields stay
 * YAML-only on purpose (the form is for the 80% case; power users
 * keep the textarea). Mounted from StylePicker via a "Form / YAML"
 * toggle (TODO P5.07-style polish — Track A ships the building block).
 */
import React from 'react';
import './StyleFormEditor.css';

export interface StyleFormState {
  name: string;
  removeSilence: boolean;
  removeFillers: boolean;
  hookDurationSec: number;
  hookCutsPerSec: number;
  bodyCutsPerSec: number;
  beatSync: boolean;
  colorPreset: string;
  audioMusicGainDb: number;
  audioDuckingDb: number;
}

export const DEFAULT_FORM_STATE: StyleFormState = {
  name: 'my-style',
  removeSilence: true,
  removeFillers: true,
  hookDurationSec: 3,
  hookCutsPerSec: 2,
  bodyCutsPerSec: 0.8,
  beatSync: false,
  colorPreset: '',
  audioMusicGainDb: -14,
  audioDuckingDb: -8,
};

/** Convert form state → YAML string (sent to the server's style.parse). */
export function yamlFromForm(s: StyleFormState): string {
  const lines: string[] = [];
  lines.push(`name: ${s.name}`);
  lines.push(`removeSilence: ${s.removeSilence}`);
  lines.push(`removeFillers: ${s.removeFillers}`);
  lines.push('pacing:');
  lines.push('  hook:');
  lines.push(`    durationSec: ${s.hookDurationSec}`);
  lines.push(`    cutsPerSec: ${s.hookCutsPerSec}`);
  lines.push('  body:');
  lines.push(`    cutsPerSec: ${s.bodyCutsPerSec}`);
  lines.push(`    beatSync: ${s.beatSync}`);
  if (s.colorPreset.trim()) {
    lines.push('color:');
    lines.push(`  preset: ${s.colorPreset.trim()}`);
  }
  lines.push('audio:');
  lines.push(`  musicGainDb: ${s.audioMusicGainDb}`);
  lines.push(`  duckingDb: ${s.audioDuckingDb}`);
  return `${lines.join('\n')}\n`;
}

/** Lightweight reverse parse — pulls known fields out of YAML for the toggle. */
export function formFromYaml(yaml: string, fallback = DEFAULT_FORM_STATE): StyleFormState {
  const grab = (re: RegExp, base: string | number | boolean): string => {
    const m = yaml.match(re);
    return m && m[1] !== undefined ? m[1].trim() : String(base);
  };
  const num = (re: RegExp, base: number): number => {
    const v = grab(re, base);
    const n = Number(v);
    return Number.isFinite(n) ? n : base;
  };
  const bool = (re: RegExp, base: boolean): boolean => {
    const v = grab(re, base).toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
    return base;
  };
  return {
    name: grab(/^name:\s*(.+)$/m, fallback.name),
    removeSilence: bool(/^removeSilence:\s*(true|false)/m, fallback.removeSilence),
    removeFillers: bool(/^removeFillers:\s*(true|false)/m, fallback.removeFillers),
    hookDurationSec: num(/hook:[\s\S]*?durationSec:\s*([\d.]+)/, fallback.hookDurationSec),
    hookCutsPerSec: num(/hook:[\s\S]*?cutsPerSec:\s*([\d.]+)/, fallback.hookCutsPerSec),
    bodyCutsPerSec: num(/body:[\s\S]*?cutsPerSec:\s*([\d.]+)/, fallback.bodyCutsPerSec),
    beatSync: bool(/body:[\s\S]*?beatSync:\s*(true|false)/, fallback.beatSync),
    colorPreset: grab(/color:[\s\S]*?preset:\s*(.+)/, fallback.colorPreset),
    audioMusicGainDb: num(/audio:[\s\S]*?musicGainDb:\s*(-?[\d.]+)/, fallback.audioMusicGainDb),
    audioDuckingDb: num(/audio:[\s\S]*?duckingDb:\s*(-?[\d.]+)/, fallback.audioDuckingDb),
  };
}

export interface StyleFormEditorProps {
  value: StyleFormState;
  onChange: (next: StyleFormState) => void;
}

export function StyleFormEditor({ value, onChange }: StyleFormEditorProps): React.ReactElement {
  const set = <K extends keyof StyleFormState>(k: K, v: StyleFormState[K]): void => {
    onChange({ ...value, [k]: v });
  };

  return (
    <div className="style-form">
      <fieldset>
        <legend>Name</legend>
        <input value={value.name} onChange={(e) => set('name', e.target.value)} />
      </fieldset>

      <fieldset>
        <legend>Trim</legend>
        <label>
          <input
            type="checkbox"
            checked={value.removeSilence}
            onChange={(e) => set('removeSilence', e.target.checked)}
          />
          Remove silence
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.removeFillers}
            onChange={(e) => set('removeFillers', e.target.checked)}
          />
          Remove fillers (um, uh, like…)
        </label>
      </fieldset>

      <fieldset>
        <legend>Pacing</legend>
        <label>
          Hook duration (s)
          <input
            type="number"
            step="0.5"
            min="0"
            value={value.hookDurationSec}
            onChange={(e) => set('hookDurationSec', Number(e.target.value))}
          />
        </label>
        <label>
          Hook cuts/sec
          <input
            type="number"
            step="0.1"
            min="0"
            value={value.hookCutsPerSec}
            onChange={(e) => set('hookCutsPerSec', Number(e.target.value))}
          />
        </label>
        <label>
          Body cuts/sec
          <input
            type="number"
            step="0.1"
            min="0"
            value={value.bodyCutsPerSec}
            onChange={(e) => set('bodyCutsPerSec', Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.beatSync}
            onChange={(e) => set('beatSync', e.target.checked)}
          />
          Snap body cuts to beat
        </label>
      </fieldset>

      <fieldset>
        <legend>Color</legend>
        <label>
          Lumetri preset (optional)
          <input
            value={value.colorPreset}
            placeholder="WarmVlog / TealOrange / …"
            onChange={(e) => set('colorPreset', e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Audio</legend>
        <label>
          Music gain (dB)
          <input
            type="number"
            step="0.5"
            value={value.audioMusicGainDb}
            onChange={(e) => set('audioMusicGainDb', Number(e.target.value))}
          />
        </label>
        <label>
          Ducking (dB)
          <input
            type="number"
            step="0.5"
            value={value.audioDuckingDb}
            onChange={(e) => set('audioDuckingDb', Number(e.target.value))}
          />
        </label>
      </fieldset>
    </div>
  );
}

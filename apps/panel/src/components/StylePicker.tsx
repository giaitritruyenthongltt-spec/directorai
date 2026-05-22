import React, { useState } from 'react';
import './StylePicker.css';

const BUILTIN_STYLES = ['vlog', 'cinematic', 'techReel', 'podcast', 'tutorial'];

const DESCRIPTIONS: Record<string, string> = {
  vlog: 'Talking-head: tight cuts, jump-cut silences, warm color',
  cinematic: 'Slow pacing, J/L cuts, teal-orange grade',
  techReel: 'Punchy short-form: quick zooms, beat sync, captions',
  podcast: 'Multi-cam minimal: silence trim only',
  tutorial: 'Screen-recording: zoom highlights, callouts',
};

export function StylePicker(): React.ReactElement {
  const [selected, setSelected] = useState<string | null>(null);
  const [customYaml, setCustomYaml] = useState('');
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');

  return (
    <div className="style-picker">
      <div className="sp-mode-row">
        <button
          className={`sp-mode-btn ${mode === 'preset' ? 'active' : ''}`}
          onClick={() => setMode('preset')}
        >
          Presets
        </button>
        <button
          className={`sp-mode-btn ${mode === 'custom' ? 'active' : ''}`}
          onClick={() => setMode('custom')}
        >
          Custom YAML
        </button>
      </div>

      {mode === 'preset' && (
        <div className="sp-presets">
          {BUILTIN_STYLES.map((name) => (
            <div
              key={name}
              className={`sp-preset ${selected === name ? 'selected' : ''}`}
              onClick={() => setSelected(name)}
            >
              <span className="sp-name">{name}</span>
              <span className="sp-desc">{DESCRIPTIONS[name]}</span>
            </div>
          ))}
        </div>
      )}

      {mode === 'custom' && (
        <div className="sp-custom">
          <textarea
            className="sp-yaml"
            value={customYaml}
            onChange={(e) => setCustomYaml(e.target.value)}
            placeholder={`name: My Style
pacing:
  body:
    cutsPerSec: 1
removeFillers: true
removeSilence: true`}
          />
        </div>
      )}

      <div className="sp-actions">
        <button className="sp-apply" disabled={mode === 'preset' ? !selected : !customYaml.trim()}>
          Apply Style
        </button>
      </div>
    </div>
  );
}

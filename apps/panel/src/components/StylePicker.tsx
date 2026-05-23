/**
 * Style tab — built-in selection, custom YAML, dry-run + apply,
 * plan/result preview (P3.15 + P3.17).
 */

import React, { useEffect, useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import './StylePicker.css';

const DESCRIPTIONS: Record<string, string> = {
  vlog: 'Talking-head: tight cuts, jump-cut silences, warm color',
  cinematic: 'Slow pacing, J/L cuts, teal-orange grade',
  techReel: 'Punchy short-form: quick zooms, beat sync, captions',
  podcast: 'Multi-cam minimal: silence trim only',
  tutorial: 'Screen-recording: zoom highlights, callouts',
};

const SAMPLE_CUSTOM = `name: My Style
description: Custom blend
pacing:
  hook:
    durationSec: 3
    cutsPerSec: 2
  body:
    cutsPerSec: 0.8
removeFillers: true
removeSilence: true
color:
  preset: WarmVlog
`;

interface PlanStepLite {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
}

interface PlanResult {
  style: string;
  steps: PlanStepLite[];
  estimatedDurationSec: number;
  summary: string;
}

interface ExecutionResult {
  ok: number;
  errors: number;
  totalMs: number;
  dryRun: boolean;
  steps: { status: string; step: PlanStepLite; error?: string; durationMs: number }[];
  report: string;
}

interface ContextSummary {
  mediaPath: string;
  durationSec: number;
  segments: { start: number; end: number; text: string }[];
  scenes: { start: number; end: number }[];
  beats?: number[];
}

const DEMO_CONTEXT: ContextSummary = {
  mediaPath: 'C:\\Footage\\demo.mp4',
  durationSec: 90,
  segments: [
    { start: 0, end: 3, text: 'Hello and welcome' },
    { start: 3, end: 28, text: 'today we ship the AI premiere plugin' },
    { start: 28, end: 80, text: 'the plugin analyzes your footage and edits like you would' },
    { start: 80, end: 90, text: 'thanks for watching' },
  ],
  scenes: [{ start: 0, end: 90 }],
  beats: [5, 10, 15, 20],
};

export function StylePicker(): React.ReactElement {
  const [builtinNames, setBuiltinNames] = useState<readonly string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [customYaml, setCustomYaml] = useState(SAMPLE_CUSTOM);
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [contextJson, setContextJson] = useState(JSON.stringify(DEMO_CONTEXT, null, 2));
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await wsClient.call<{ styles: string[] }>('style.list');
        setBuiltinNames(r.styles);
        if (r.styles.length && !selected) setSelected(r.styles[0]!);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const styleRef = (): { name: string } | { yaml: string } | null => {
    if (mode === 'preset') return selected ? { name: selected } : null;
    return customYaml.trim() ? { yaml: customYaml } : null;
  };

  const parsedContext = (): ContextSummary | null => {
    try {
      return JSON.parse(contextJson) as ContextSummary;
    } catch {
      return null;
    }
  };

  const callPlan = async (): Promise<void> => {
    const sr = styleRef();
    const ctx = parsedContext();
    if (!sr || !ctx) {
      setError('Pick a style and ensure context JSON is valid');
      return;
    }
    setBusy('Planning');
    setError(null);
    setPlan(null);
    setExecution(null);
    try {
      const result = await wsClient.call<PlanResult>('style.plan', { style: sr, context: ctx });
      setPlan(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const callDryRun = async (): Promise<void> => {
    const sr = styleRef();
    const ctx = parsedContext();
    if (!sr || !ctx) {
      setError('Pick a style and ensure context JSON is valid');
      return;
    }
    setBusy('Dry-running');
    setError(null);
    setExecution(null);
    try {
      const result = await wsClient.call<ExecutionResult>('style.dryRun', {
        style: sr,
        context: ctx,
      });
      setExecution(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const callApply = async (): Promise<void> => {
    const sr = styleRef();
    const ctx = parsedContext();
    if (!sr || !ctx) {
      setError('Pick a style and ensure context JSON is valid');
      return;
    }
    if (!window.confirm(`Apply style to active sequence? (${plan?.steps.length ?? '?'} steps)`))
      return;
    setBusy('Applying');
    setError(null);
    setExecution(null);
    try {
      const result = await wsClient.call<ExecutionResult>('style.apply', {
        style: sr,
        context: ctx,
        dryRun: false,
      });
      setExecution(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

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
          {builtinNames.map((name) => (
            <div
              key={name}
              className={`sp-preset ${selected === name ? 'selected' : ''}`}
              onClick={() => setSelected(name)}
            >
              <span className="sp-name">{name}</span>
              <span className="sp-desc">{DESCRIPTIONS[name] ?? ''}</span>
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
            spellCheck={false}
          />
        </div>
      )}

      <details className="sp-ctx">
        <summary>Media context (JSON)</summary>
        <textarea
          className="sp-ctx-json"
          value={contextJson}
          onChange={(e) => setContextJson(e.target.value)}
          spellCheck={false}
        />
      </details>

      <div className="sp-actions">
        <button className="sp-btn" disabled={!!busy} onClick={() => void callPlan()}>
          Plan
        </button>
        <button className="sp-btn" disabled={!!busy} onClick={() => void callDryRun()}>
          Dry-Run
        </button>
        <button className="sp-btn primary" disabled={!!busy} onClick={() => void callApply()}>
          Apply
        </button>
      </div>

      {busy && <div className="sp-busy">⏳ {busy}…</div>}
      {error && <div className="sp-error">✗ {error}</div>}

      {plan && (
        <div className="sp-plan">
          <header className="sp-plan-hd">
            <strong>{plan.style}</strong> · {plan.steps.length} steps · est{' '}
            {plan.estimatedDurationSec.toFixed(1)}s
          </header>
          <ul className="sp-plan-list">
            {plan.steps.slice(0, 30).map((s) => (
              <li key={s.id}>
                <span className="sp-step-tool">{s.tool}</span> — <em>{s.reason}</em>
              </li>
            ))}
            {plan.steps.length > 30 && (
              <li className="sp-plan-more">… {plan.steps.length - 30} more</li>
            )}
          </ul>
        </div>
      )}

      {execution && (
        <div className="sp-exec">
          <header className={`sp-exec-hd ${execution.errors > 0 ? 'err' : 'ok'}`}>
            {execution.dryRun ? 'Dry-run' : 'Applied'} · ✓ {execution.ok} · ✗ {execution.errors} ·{' '}
            {execution.totalMs}ms
          </header>
          <pre className="sp-exec-report">{execution.report.slice(0, 3500)}</pre>
        </div>
      )}
    </div>
  );
}

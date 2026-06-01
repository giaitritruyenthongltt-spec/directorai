/**
 * Sprint G — Director tab.
 *
 * The main "magic moment" UI: user picks a goal preset + persona, hits
 * Generate, the panel calls `director.plan` on the server, then shows
 * the LLM-generated plan with step-by-step preview + Execute / Cancel
 * controls.
 *
 * Network IO is delegated to wsClient — this component is plain React
 * state + DOM.
 */

import React, { useEffect, useState } from 'react';

import { wsClient } from '../bridge/ws-client.js';
import './DirectorTab.css';

type Persona = 'cinematic' | 'action' | 'vlog' | 'vintage';
type PlanStatus = 'draft' | 'running' | 'paused' | 'done' | 'cancelled' | 'error';

interface PlanStep {
  id: number;
  tool: string;
  params: Record<string, unknown>;
  why: string;
  checkpoint: boolean;
}

interface Plan {
  title: string;
  goal: string;
  persona: Persona;
  estimatedMinutes: number;
  note?: string;
  steps: PlanStep[];
}

interface StepResult {
  stepId: number;
  ok: boolean;
  error?: string;
  elapsedMs: number;
}

interface PlanProgress {
  planId: string;
  status: PlanStatus;
  currentStep: number;
  totalSteps: number;
  stepResults?: StepResult[];
}

const GOAL_PRESETS = [
  { id: 'travel-cinematic-3min', label: 'Travel vlog — Cinematic — 3 min' },
  { id: 'action-montage-60s', label: 'Action montage — 60s' },
  { id: 'wedding-highlight-2min', label: 'Wedding highlight — 2 min' },
  { id: 'product-showcase-30s', label: 'Product showcase — 30s' },
  { id: 'family-memory-1min', label: 'Family memory — 1 min' },
  { id: 'custom', label: 'Custom (type your own goal)' },
];

const PERSONA_LABELS: Record<Persona, string> = {
  cinematic: 'Cinematic editor',
  action: 'Action editor',
  vlog: 'Vlog editor',
  vintage: 'Vintage editor',
};

const PERSONA_TIPS: Record<Persona, string> = {
  cinematic: 'Slow, deliberate cuts. Warm grade. Music-driven.',
  action: 'Fast beat-matched cuts. Whip pans. Teal & orange.',
  vlog: 'Casual dialogue cuts. Bright warm tones. Captions.',
  vintage: 'Soft dissolves. Film grain. Nostalgic.',
};

export function DirectorTab(): React.ReactElement {
  const [goalId, setGoalId] = useState<string>(GOAL_PRESETS[0].id);
  const [customGoal, setCustomGoal] = useState<string>('');
  const [persona, setPersona] = useState<Persona>('cinematic');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<PlanProgress | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const goalText = (): string => {
    if (goalId === 'custom') return customGoal.trim();
    return GOAL_PRESETS.find((g) => g.id === goalId)?.label ?? '';
  };

  const generate = async (): Promise<void> => {
    setError(null);
    setProgress(null);
    setBusy(true);
    setPlan(null);
    try {
      const goal = goalText();
      if (!goal) {
        setError('Type a goal first');
        return;
      }
      // The server endpoint can be a no-op stub when ANTHROPIC_API_KEY
      // isn't set — it returns a sample plan so the UI is testable.
      const result = await wsClient.call<Plan>('director.plan', {
        goal,
        persona,
      });
      setPlan(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const execute = async (): Promise<void> => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const r = await wsClient.call<{ planId: string }>('director.execute', { plan });
      setProgress({
        planId: r.planId,
        status: 'running',
        currentStep: 0,
        totalSteps: plan.steps.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    if (!progress) return;
    try {
      await wsClient.call('director.cancel', { planId: progress.planId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // P3-3 — refine the current plan with free-text feedback.
  const [feedback, setFeedback] = useState<string>('');
  const refine = async (): Promise<void> => {
    if (!progress?.planId || !feedback.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const refined = await wsClient.call<Plan>('director.refine', {
        previousPlanId: progress.planId,
        feedback: feedback.trim(),
        persona,
      });
      setPlan(refined);
      setProgress(null);
      setFeedback('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Poll progress while running
  useEffect(() => {
    if (
      !progress ||
      progress.status === 'done' ||
      progress.status === 'cancelled' ||
      progress.status === 'error'
    ) {
      return;
    }
    const t = setInterval(() => {
      void wsClient
        .call<PlanProgress>('director.progress', { planId: progress.planId })
        .then((p) => setProgress(p))
        .catch((e) => {
          // Swallow polling errors silently — surfaced via .error state if needed
          void e;
        });
    }, 1000);
    return () => clearInterval(t);
  }, [progress]);

  const pct = progress ? Math.round((100 * progress.currentStep) / progress.totalSteps) : 0;

  // Planning progress feedback — Gemini takes 15-45s, show elapsed time.
  const [planningElapsed, setPlanningElapsed] = useState<number>(0);
  useEffect(() => {
    if (!busy || plan || progress) {
      setPlanningElapsed(0);
      return;
    }
    const started = Date.now();
    const t = setInterval(
      () => setPlanningElapsed(Math.round((Date.now() - started) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [busy, plan, progress]);

  const reset = (): void => {
    setPlan(null);
    setProgress(null);
    setError(null);
  };

  return (
    <div className="director-tab">
      <header className="director-header">
        <h2>🎬 Director</h2>
        <p className="director-sub">Mô tả video bạn muốn — AI sẽ tạo plan rồi dựng giúp bạn.</p>
      </header>

      <section className="director-section">
        <label htmlFor="goal-select">Mục tiêu</label>
        <select
          id="goal-select"
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          disabled={busy}
        >
          {GOAL_PRESETS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        {goalId === 'custom' && (
          <textarea
            className="director-custom-goal"
            placeholder="e.g. Dựng video du lịch Đà Lạt 3 phút cảm xúc"
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            disabled={busy}
            rows={2}
          />
        )}
      </section>

      <section className="director-section">
        <label htmlFor="persona-select">Phong cách</label>
        <select
          id="persona-select"
          value={persona}
          onChange={(e) => setPersona(e.target.value as Persona)}
          disabled={busy}
        >
          {(Object.keys(PERSONA_LABELS) as Persona[]).map((p) => (
            <option key={p} value={p}>
              {PERSONA_LABELS[p]}
            </option>
          ))}
        </select>
        <p className="director-tip">{PERSONA_TIPS[persona]}</p>
      </section>

      <section className="director-section">
        <button className="director-primary" onClick={() => void generate()} disabled={busy}>
          {busy && !plan ? `⏳ Đang sinh plan… ${planningElapsed}s (≈ 15-45s)` : '✨ Sinh plan'}
        </button>
        {error && (
          <div className="director-error">
            <div className="director-error-msg">{error}</div>
            <button className="director-secondary" onClick={reset}>
              Thử lại
            </button>
          </div>
        )}
      </section>

      {plan && (
        <section className="director-plan">
          <h3>{plan.title}</h3>
          <p className="director-plan-meta">
            ~{plan.estimatedMinutes} phút · {plan.steps.length} bước · {plan.persona}
          </p>
          {plan.note && <p className="director-plan-note">{plan.note}</p>}
          <ol className="director-steps">
            {plan.steps.map((s) => {
              // P3-2 — annotate each step with live progress state.
              const resultsForStep = progress?.stepResults?.find((r) => r.stepId === s.id);
              const isCurrent = progress?.status === 'running' && progress.currentStep + 1 === s.id;
              const classes = [
                'director-step',
                s.checkpoint ? 'checkpoint' : '',
                isCurrent ? 'current' : '',
                resultsForStep ? (resultsForStep.ok ? 'ok' : 'failed') : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <li key={s.id} className={classes}>
                  <span className="director-step-id">
                    {resultsForStep?.ok ? '✓' : resultsForStep ? '✗' : isCurrent ? '▶' : s.id}
                  </span>
                  <span className="director-step-tool">{s.tool}</span>
                  <span className="director-step-why">{s.why}</span>
                  {s.checkpoint && <span className="director-step-cp">⏸ điểm dừng</span>}
                  {resultsForStep && !resultsForStep.ok && resultsForStep.error && (
                    <span className="director-step-err" title={resultsForStep.error}>
                      {resultsForStep.error.slice(0, 60)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {!progress && (
            <div className="director-plan-actions">
              <button className="director-primary" onClick={() => void execute()} disabled={busy}>
                ▶ Chạy plan
              </button>
              <button className="director-secondary" onClick={reset}>
                Hủy
              </button>
            </div>
          )}
        </section>
      )}

      {progress && (
        <section className="director-progress">
          <div className="director-progress-bar">
            <div
              className={`director-progress-fill status-${progress.status}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="director-progress-meta">
            Bước {progress.currentStep}/{progress.totalSteps} · {progressLabel(progress.status)}
          </div>
          {progress.status === 'running' && (
            <button className="director-secondary" onClick={() => void cancel()}>
              Dừng
            </button>
          )}
          {(progress.status === 'done' ||
            progress.status === 'error' ||
            progress.status === 'cancelled') && (
            <>
              <button className="director-secondary" onClick={reset}>
                Plan mới
              </button>
              {/* P3-3 — refine feedback box, only after a run finishes */}
              <div className="director-refine">
                <label htmlFor="refine-input">Tinh chỉnh plan này:</label>
                <textarea
                  id="refine-input"
                  className="director-custom-goal"
                  placeholder="e.g. cắt nhanh hơn, màu ấm hơn, bỏ phần silence"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={busy}
                  rows={2}
                />
                <button
                  className="director-secondary"
                  onClick={() => void refine()}
                  disabled={busy || !feedback.trim()}
                >
                  🔁 Tinh chỉnh
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function progressLabel(status: PlanStatus): string {
  switch (status) {
    case 'draft':
      return 'nháp';
    case 'running':
      return 'đang chạy';
    case 'paused':
      return 'tạm dừng';
    case 'done':
      return 'hoàn thành';
    case 'cancelled':
      return 'đã hủy';
    case 'error':
      return 'lỗi';
  }
}

/**
 * Tab Đạo diễn — giao diện chính của DirectorAI (tiếng Việt).
 *
 * Quy trình: bạn chọn mục tiêu + phong cách → AI sinh kế hoạch dựng →
 * bạn xem trước → AI thực thi trên timeline. Mọi giao tiếp mạng đi qua
 * wsClient; component này chỉ là state + DOM thuần.
 */

import React, { useEffect, useState } from 'react';

import { wsClient, type ConnectionState } from '../bridge/ws-client.js';
import { HelpButton } from './HelpButton.js';
import { WorkflowDiagram } from './WorkflowDiagram.js';
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

/** Mục tiêu mẫu — mô tả bằng tiếng Việt, kèm prompt thực gửi cho AI. */
const GOAL_PRESETS: { id: string; label: string; prompt: string }[] = [
  {
    id: 'travel-cinematic',
    label: '🏞️ Video du lịch — Điện ảnh — 3 phút',
    prompt: 'Dựng video du lịch phong cách điện ảnh dài khoảng 3 phút, chọn cảnh đẹp nhất',
  },
  {
    id: 'action-montage',
    label: '⚡ Montage hành động — 60 giây',
    prompt: 'Tạo montage hành động nhịp nhanh 60 giây, cắt theo nhịp',
  },
  {
    id: 'remove-lowquality',
    label: '🧹 Lọc bỏ cảnh chất lượng kém',
    prompt:
      'Phân tích chất lượng từng clip (mờ, thiếu sáng, lệch khung) và xoá các clip chất lượng kém khỏi timeline',
  },
  {
    id: 'cut-silence',
    label: '🔇 Cắt bỏ khoảng lặng audio',
    prompt: 'Tìm và cắt bỏ tất cả khoảng lặng dài trên track audio',
  },
  {
    id: 'family-memory',
    label: '👨‍👩‍👧 Video kỷ niệm gia đình — 1 phút',
    prompt: 'Dựng video kỷ niệm gia đình ấm áp dài 1 phút từ các clip đẹp nhất',
  },
  {
    id: 'custom',
    label: '✏️ Tự nhập mục tiêu của bạn',
    prompt: '',
  },
];

const PERSONA_LABELS: Record<Persona, string> = {
  cinematic: '🎞️ Điện ảnh',
  action: '⚡ Hành động',
  vlog: '📹 Vlog',
  vintage: '📼 Hoài cổ',
};

const PERSONA_TIPS: Record<Persona, string> = {
  cinematic: 'Cắt chậm, có chủ đích. Tông màu ấm. Theo nhạc nền.',
  action: 'Cắt nhanh theo nhịp. Whip pan. Tông teal & cam.',
  vlog: 'Cắt hội thoại tự nhiên. Tông sáng ấm. Có phụ đề.',
  vintage: 'Chuyển cảnh mềm. Hạt film. Cảm giác hoài niệm.',
};

/** Dịch tên tool kỹ thuật sang mô tả tiếng Việt dễ hiểu. */
const TOOL_LABELS: Record<string, string> = {
  'project.getActiveSequence': 'Xác định sequence đang mở',
  'project.get': 'Đọc thông tin dự án',
  'timeline.listClips': 'Liệt kê các clip trên timeline',
  'timeline.cutClip': 'Cắt clip',
  'timeline.trimClip': 'Tỉa đầu/cuối clip',
  'timeline.deleteClip': 'Xoá clip',
  'timeline.cutOnBeats': 'Cắt theo nhịp nhạc',
  'context.scanClips': 'Quét & xếp hạng chất lượng clip',
  'context.scoreQuality': 'Chấm điểm chất lượng (mờ/sáng/khung)',
  'context.detectBeats': 'Dò nhịp nhạc',
  'context.detectSilences': 'Dò khoảng lặng audio',
  'context.analyzeColor': 'Phân tích màu sắc',
  'context.classifyScene': 'Phân loại cảnh quay',
  'context.listEffects': 'Liệt kê hiệu ứng khả dụng',
  'color.applyPreset': 'Áp preset màu Lumetri',
  'color.applyLookByScene': 'Chỉnh màu theo từng cảnh',
  'color.setParams': 'Tinh chỉnh thông số màu',
  'effect.apply': 'Áp hiệu ứng',
  'transition.apply': 'Thêm chuyển cảnh',
  'marker.add': 'Đánh dấu mốc',
  'audio.setGain': 'Chỉnh âm lượng',
  'audio.addFade': 'Thêm fade audio',
  'text.addOverlay': 'Thêm chữ overlay',
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

export function DirectorTab(): React.ReactElement {
  const [goalId, setGoalId] = useState<string>(GOAL_PRESETS[0].id);
  const [customGoal, setCustomGoal] = useState<string>('');
  const [persona, setPersona] = useState<Persona>('cinematic');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<PlanProgress | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');
  const [planningElapsed, setPlanningElapsed] = useState<number>(0);

  const goalText = (): string => {
    if (goalId === 'custom') return customGoal.trim();
    return GOAL_PRESETS.find((g) => g.id === goalId)?.prompt ?? '';
  };

  const generate = async (): Promise<void> => {
    setError(null);
    setProgress(null);
    setBusy(true);
    setPlan(null);
    try {
      const goal = goalText();
      if (!goal) {
        setError('Vui lòng nhập mục tiêu trước khi sinh kế hoạch.');
        return;
      }
      const result = await wsClient.call<Plan>('director.plan', { goal, persona });
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

  // Hỏi tiến độ liên tục khi đang chạy
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
        .catch((e) => void e);
    }, 1000);
    return () => clearInterval(t);
  }, [progress]);

  // Đếm giây khi đang sinh plan (Gemini mất 15-45s)
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

  // Trạng thái kết nối WS — hiển thị banner khi mất kết nối
  const [wsState, setWsState] = useState<ConnectionState>(wsClient.state);
  useEffect(() => wsClient.onStateChange(setWsState), []);
  const offline = wsState !== 'connected';

  const pct = progress ? Math.round((100 * progress.currentStep) / progress.totalSteps) : 0;

  // Bước hiện tại cho sơ đồ vận hành
  const activeStep = progress ? 4 : plan ? 3 : busy ? 2 : 0;

  if (offline) {
    return (
      <div className="director-tab">
        <header className="director-header">
          <h2>🎬 Đạo diễn AI</h2>
        </header>
        <div className="director-offline">
          <div className="director-offline-icon">📡</div>
          <h3>Đang kết nối tới máy chủ DirectorAI…</h3>
          <p>
            Trạng thái: <code>{wsState}</code>
          </p>
          <ul className="director-offline-help">
            <li>
              Đảm bảo máy chủ đang chạy: <code>pnpm --filter @directorai/server dev</code>
            </li>
            <li>Máy chủ lắng nghe tại ws://127.0.0.1:7778</li>
            <li>Plugin sẽ tự kết nối lại sau vài giây.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="director-tab">
      <header className="director-header">
        <h2>🎬 Đạo diễn AI</h2>
        <p className="director-sub">
          Mô tả video bạn muốn — AI sẽ lập kế hoạch rồi dựng giúp bạn ngay trên timeline.
        </p>
      </header>

      <WorkflowDiagram activeStep={activeStep} />

      {/* ── Mục tiêu ──────────────────────────────────────────── */}
      <section className="director-section">
        <div className="director-label-row">
          <label htmlFor="goal-select">Bước 1 · Mục tiêu video</label>
          <HelpButton
            title="Mục tiêu video"
            lines={[
              'Chọn loại video bạn muốn AI dựng. Mỗi mẫu đã được tối ưu sẵn.',
              'Chọn "Tự nhập" nếu muốn mô tả chi tiết bằng lời của bạn.',
            ]}
            example="Dựng video du lịch Đà Lạt 3 phút, chọn cảnh đẹp, cắt theo nhạc"
          />
        </div>
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
            placeholder="Ví dụ: Dựng video du lịch Đà Lạt 3 phút cảm xúc, cắt theo nhạc nền"
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            disabled={busy}
            rows={2}
          />
        )}
      </section>

      {/* ── Phong cách ────────────────────────────────────────── */}
      <section className="director-section">
        <div className="director-label-row">
          <label htmlFor="persona-select">Bước 2 · Phong cách dựng</label>
          <HelpButton
            title="Phong cách dựng"
            lines={[
              'Quyết định "cá tính" của bản dựng: nhịp cắt, tông màu, kiểu chuyển cảnh.',
              'AI sẽ chọn hiệu ứng và preset màu phù hợp với phong cách bạn chọn.',
            ]}
          />
        </div>
        <div className="director-persona-grid">
          {(Object.keys(PERSONA_LABELS) as Persona[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`director-persona-card ${persona === p ? 'active' : ''}`}
              onClick={() => setPersona(p)}
              disabled={busy}
            >
              <span className="director-persona-name">{PERSONA_LABELS[p]}</span>
              <span className="director-persona-tip">{PERSONA_TIPS[p]}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Sinh plan ─────────────────────────────────────────── */}
      <section className="director-section">
        <div className="director-label-row">
          <label>Bước 3 · Tạo kế hoạch</label>
          <HelpButton
            title="Tạo kế hoạch"
            lines={[
              'AI (Gemini) sẽ phân tích mục tiêu và tạo kế hoạch dựng từng bước.',
              'Quá trình mất khoảng 15-45 giây. Bạn sẽ xem được toàn bộ các bước trước khi chạy.',
            ]}
          />
        </div>
        <button className="director-primary" onClick={() => void generate()} disabled={busy}>
          {busy && !plan ? `⏳ Đang tạo kế hoạch… ${planningElapsed}s` : '✨ Tạo kế hoạch'}
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

      {/* ── Xem kế hoạch ──────────────────────────────────────── */}
      {plan && (
        <section className="director-plan">
          <div className="director-label-row">
            <h3>{plan.title}</h3>
            <HelpButton
              title="Kế hoạch dựng"
              lines={[
                'Mỗi dòng là một thao tác AI sẽ thực hiện trên timeline.',
                '⏸ = điểm dừng để bạn kiểm tra. ✓ = xong. ✗ = lỗi.',
                'Bấm "Chạy kế hoạch" để AI bắt đầu thực thi tự động.',
              ]}
            />
          </div>
          <p className="director-plan-meta">
            ⏱ ~{plan.estimatedMinutes} phút · {plan.steps.length} bước ·{' '}
            {PERSONA_LABELS[plan.persona]}
          </p>
          {plan.note && <p className="director-plan-note">{plan.note}</p>}
          <ol className="director-steps">
            {plan.steps.map((s) => {
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
                  <div className="director-step-body">
                    <span className="director-step-tool">{toolLabel(s.tool)}</span>
                    <span className="director-step-why">{s.why}</span>
                    {resultsForStep && !resultsForStep.ok && resultsForStep.error && (
                      <span className="director-step-err" title={resultsForStep.error}>
                        ⚠ {resultsForStep.error.slice(0, 80)}
                      </span>
                    )}
                  </div>
                  {s.checkpoint && <span className="director-step-cp">⏸</span>}
                </li>
              );
            })}
          </ol>
          {!progress && (
            <div className="director-plan-actions">
              <button className="director-primary" onClick={() => void execute()} disabled={busy}>
                ▶ Chạy kế hoạch
              </button>
              <button className="director-secondary" onClick={reset}>
                Huỷ
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Tiến độ thực thi ──────────────────────────────────── */}
      {progress && (
        <section className="director-progress">
          <div className="director-label-row">
            <label>Bước 4 · Tiến độ thực thi</label>
            <HelpButton
              title="Tiến độ thực thi"
              lines={[
                'AI đang thực thi từng bước trên timeline Premiere.',
                'Thanh tiến độ cho biết đã hoàn thành bao nhiêu bước.',
                'Bấm "Dừng" để ngắt giữa chừng — các bước đã làm vẫn giữ nguyên.',
              ]}
            />
          </div>
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
              ⏹ Dừng
            </button>
          )}
          {(progress.status === 'done' ||
            progress.status === 'error' ||
            progress.status === 'cancelled') && (
            <>
              <button className="director-secondary" onClick={reset}>
                🔄 Kế hoạch mới
              </button>
              <div className="director-refine">
                <div className="director-label-row">
                  <label htmlFor="refine-input">Tinh chỉnh kế hoạch này</label>
                  <HelpButton
                    title="Tinh chỉnh"
                    lines={[
                      'Chưa ưng ý? Mô tả điều muốn thay đổi, AI sẽ tạo kế hoạch mới dựa trên kế hoạch cũ.',
                    ]}
                    example="Cắt nhanh hơn, mỗi cảnh tối đa 3 giây, màu ấm hơn"
                  />
                </div>
                <textarea
                  id="refine-input"
                  className="director-custom-goal"
                  placeholder="Ví dụ: cắt nhanh hơn, màu ấm hơn, bỏ phần lặng"
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
      return '✅ hoàn thành';
    case 'cancelled':
      return 'đã huỷ';
    case 'error':
      return '❌ có lỗi';
  }
}

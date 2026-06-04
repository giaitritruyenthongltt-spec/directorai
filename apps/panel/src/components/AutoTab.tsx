/**
 * AutoTab — Chế độ ⚡ Tự động (module checklist + Run + preview + duyệt).
 *
 * R5 — Nguồn clip + map path nay DÙNG CHUNG qua <ClipSourcePanel/> (useSession)
 * → tab Tự động giờ CÓ chức năng lấy path như tab Phim; map 1 lần dùng mọi nơi,
 * đổi tab không mất. Tab này chỉ giữ state: module đã tích + mục tiêu + kết quả.
 */

import React, { useEffect, useState } from 'react';
import {
  MODULE_REGISTRY,
  moduleInfo,
  buildGoalFromModules,
  NERF_TEMPLATES,
} from '@directorai/modules';
import { wsClient } from '../bridge/ws-client.js';
import { useSession } from '../state/session.js';
import { ClipSourcePanel } from './ClipSourcePanel.js';
import { HelpButton } from './HelpButton.js';
import { Icon } from './Icon.js';
import './AutoTab.css';

const MODULES = MODULE_REGISTRY.map(moduleInfo);
const DEFAULT_TICKED = MODULES.filter((m) => m.defaultEnabled).map((m) => m.id);

type StepStatus = 'applied' | 'failed' | 'skipped' | 'deferred' | 'dry-run';
interface StepResult {
  order: number;
  action: string;
  status: StepStatus;
  detail: string;
}
interface ApplyResponse {
  dryRun: boolean;
  total: number;
  applied: number;
  failed: number;
  skipped: number;
  deferred: number;
  dryRunCount: number;
  results: StepResult[];
  approvalNote?: string;
  plan: { goal_understanding: string; strategy: string };
}

/** R6 — chấm màu trạng thái (CSS) thay emoji 🔵🟡 (tránh tofu). */
const STATUS_COLOR: Record<StepStatus, string> = {
  'dry-run': 'var(--accent)',
  deferred: 'var(--warn)',
  skipped: 'var(--text-dim)',
  applied: 'var(--success)',
  failed: 'var(--error)',
};

export function AutoTab(): React.ReactElement {
  const s = useSession();
  // G9 — nhớ module đã tích qua reload.
  const [ticked, setTicked] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('directorai_ticked');
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      // bỏ qua
    }
    return new Set(DEFAULT_TICKED);
  });
  useEffect(() => {
    try {
      localStorage.setItem('directorai_ticked', JSON.stringify([...ticked]));
    } catch {
      // bỏ qua
    }
  }, [ticked]);
  const [customGoal, setCustomGoal] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApplyResponse | null>(null);
  const [applied, setApplied] = useState<ApplyResponse | null>(null);

  const clipPaths = s.clipPaths;

  const toggle = (id: string): void => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
    setApplied(null);
  };

  // MOD-7 — áp template: chỉ tích module enabled trong template.
  const applyTemplate = (moduleIds: string[], goal: string): void => {
    const enabledIds = MODULES.filter((m) => m.enabled && moduleIds.includes(m.id)).map(
      (m) => m.id
    );
    setTicked(new Set(enabledIds));
    setCustomGoal(goal);
    setPreview(null);
    setApplied(null);
  };

  const buildGoal = (): string => buildGoalFromModules(Array.from(ticked), customGoal);

  const run = async (dryRun: boolean, approved: boolean): Promise<void> => {
    setError(null);
    if (clipPaths.length === 0) {
      setError('Chưa có clip có đường dẫn — bấm "Lấy path tự động" ở mục Nguồn clip.');
      return;
    }
    const goal = buildGoal();
    if (!goal) {
      setError('Hãy tích ít nhất 1 module hoặc nhập mục tiêu.');
      return;
    }
    setBusy(true);
    try {
      const res = await wsClient.call<ApplyResponse>('safe.applyPlan', {
        clipPaths,
        goal,
        dryRun,
        approved,
      });
      if (dryRun) {
        setPreview(res);
        setApplied(null);
      } else {
        setApplied(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const renderResult = (r: ApplyResponse, title: string): React.ReactElement => (
    <div className="auto-result">
      <div className="auto-result-head">{title}</div>
      <div className="auto-plan-summary">
        <div>
          <strong>🧠 Hiểu mục tiêu:</strong> {r.plan?.goal_understanding}
        </div>
        <div>
          <strong>♟ Chiến lược:</strong> {r.plan?.strategy}
        </div>
      </div>
      <ul className="auto-steps">
        {r.results.map((st) => (
          <li key={st.order} className={`auto-step status-${st.status}`}>
            <span
              className="auto-step-dot"
              style={{ background: STATUS_COLOR[st.status] ?? 'var(--text-dim)' }}
            />
            <span className="auto-step-action">{st.action}</span>
            <span className="auto-step-detail">{st.detail}</span>
          </li>
        ))}
      </ul>
      <div className="auto-counts">
        <span className="auto-dot" style={{ background: 'var(--accent)' }} /> xem {r.dryRunCount} ·{' '}
        <span className="auto-dot" style={{ background: 'var(--success)' }} /> ghi {r.applied} ·{' '}
        <span className="auto-dot" style={{ background: 'var(--warn)' }} /> hoãn {r.deferred} ·{' '}
        <span className="auto-dot" style={{ background: 'var(--text-dim)' }} /> bỏ {r.skipped} ·{' '}
        <span className="auto-dot" style={{ background: 'var(--error)' }} /> lỗi {r.failed}
      </div>
      {r.approvalNote && <div className="auto-approval-note">⚠ {r.approvalNote}</div>}
    </div>
  );

  return (
    <div className="auto-tab">
      <div className="auto-intro">
        <h2>
          <Icon name="zap" size={18} /> Chế độ Tự động
          <HelpButton
            title="Chế độ Tự động hoạt động thế nào?"
            lines={[
              '1. Tích các việc bạn muốn AI làm (mỗi ô là một "module").',
              '2. Nguồn clip + đường dẫn lấy chung với tab Phim (map 1 lần).',
              '3. Bấm "Xem trước" — AI lập kế hoạch, chỉ MÔ PHỎNG, chưa ghi.',
              '4. Ổn rồi bấm "Duyệt & Ghi" — mới ghi thật (có hoàn tác).',
            ]}
            example="Tích 'Lọc clip kém' + 'Đổi tên' → AI ẩn clip hỏng và đặt tên clip theo cảnh."
          />
        </h2>
        <p className="auto-sub">AI hiểu nội dung như editor — luôn xem trước trước khi ghi.</p>
      </div>

      <section className="auto-section">
        <div className="auto-section-title">
          <Icon name="sparkles" size={15} /> Mẫu nhanh (1-click)
        </div>
        <div className="auto-templates">
          {NERF_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="auto-template-btn"
              title={t.description}
              onClick={() => applyTemplate(t.moduleIds, t.goal)}
            >
              <span className="auto-template-icon">{t.icon}</span>
              {t.name}
            </button>
          ))}
        </div>
      </section>

      <section className="auto-section">
        <div className="auto-section-title">
          1. Chọn việc cần làm
          <HelpButton
            title="Các module"
            lines={[
              'Mỗi module là một loại thao tác an toàn (hoàn tác được).',
              'Module mờ là chưa khả dụng trên Premiere 26 (sẽ mở sau).',
            ]}
          />
        </div>
        <div className="auto-modules">
          {MODULES.map((m) => (
            <label
              key={m.id}
              className={`auto-module ${ticked.has(m.id) ? 'on' : ''} ${m.enabled ? '' : 'disabled'}`}
              title={m.goalHint || m.help.title}
            >
              <input
                type="checkbox"
                checked={ticked.has(m.id)}
                disabled={!m.enabled}
                onChange={() => toggle(m.id)}
              />
              <span className="auto-module-icon">{m.icon}</span>
              <span className="auto-module-label">{m.name}</span>
              <HelpButton title={m.help.title} lines={m.help.lines} example={m.help.example} />
              {!m.enabled && <span className="auto-module-soon">sắp có</span>}
            </label>
          ))}
        </div>
      </section>

      {/* 2. Nguồn clip — DÙNG CHUNG với tab Phim (map 1 lần) */}
      <ClipSourcePanel title="2. Nguồn clip (dùng chung mọi tab)" />

      <section className="auto-section">
        <div className="auto-section-title">
          3. Mục tiêu thêm (tuỳ chọn)
          <HelpButton
            title="Mục tiêu"
            lines={['Mô tả thêm điều bạn muốn, AI sẽ cân nhắc cùng các module đã tích.']}
            example="Làm bản dựng ~45 giây gay cấn nhất."
          />
        </div>
        <input
          className="auto-goal"
          type="text"
          placeholder="vd: làm bản action 45s gay cấn nhất…"
          value={customGoal}
          onChange={(e) => setCustomGoal(e.target.value)}
        />
      </section>

      {error && (
        <div className="auto-error">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <div className="auto-actions">
        <button className="auto-btn preview" disabled={busy} onClick={() => void run(true, false)}>
          {busy && !applied ? (
            <>
              <Icon name="refresh" size={15} className="spin" /> Đang lập kế hoạch…
            </>
          ) : (
            <>
              <Icon name="eye" size={15} /> Xem trước (không ghi)
            </>
          )}
        </button>
        <button
          className="auto-btn apply"
          disabled={busy || !preview}
          title={!preview ? 'Hãy "Xem trước" rồi mới ghi' : 'Ghi thật (có hoàn tác)'}
          onClick={() => {
            if (window.confirm('Ghi thật lên timeline? (có thể Undo trong Premiere)')) {
              void run(false, true);
            }
          }}
        >
          <Icon name="check" size={15} /> Duyệt &amp; Ghi
        </button>
      </div>

      {preview && !applied && renderResult(preview, 'Xem trước (chưa ghi gì)')}
      {applied && renderResult(applied, 'Đã thực thi')}
    </div>
  );
}

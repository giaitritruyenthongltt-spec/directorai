/**
 * AutoTab — Chế độ ⚡ Tự động (module checklist + Run + preview + duyệt).
 *
 * Quy trình an toàn (Tầng an toàn SAFE-1):
 *   1. Tích các module muốn chạy + dán đường dẫn file gốc + (tuỳ chọn) mục tiêu.
 *   2. "Xem trước" → AI lập kế hoạch → preview từng bước (KHÔNG ghi).
 *   3. "Duyệt & Ghi" → ghi thật (disable/trim/move/rename) — có hoàn tác.
 *
 * Mọi thao tác đi qua safe.applyPlan: ghi thật bắt buộc dryRun:false +
 * approved:true. Không bao giờ ghi khi chưa xem trước + duyệt.
 */

import React, { useState } from 'react';
import {
  MODULE_REGISTRY,
  moduleInfo,
  buildGoalFromModules,
  NERF_TEMPLATES,
} from '@directorai/modules';
import { wsClient } from '../bridge/ws-client.js';
import { HelpButton } from './HelpButton.js';
import './AutoTab.css';

// MOD-1b — render động từ registry canonical (@directorai/modules).
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

const STATUS_ICON: Record<StepStatus, string> = {
  'dry-run': '🔵',
  deferred: '🟡',
  skipped: '⚪',
  applied: '🟢',
  failed: '🔴',
};

export function AutoTab(): React.ReactElement {
  const [ticked, setTicked] = useState<Set<string>>(new Set(DEFAULT_TICKED));
  const [clipText, setClipText] = useState<string>('');
  const [customGoal, setCustomGoal] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApplyResponse | null>(null);
  const [applied, setApplied] = useState<ApplyResponse | null>(null);

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

  const clipPaths = clipText
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const buildGoal = (): string => buildGoalFromModules(Array.from(ticked), customGoal);

  const run = async (dryRun: boolean, approved: boolean): Promise<void> => {
    setError(null);
    if (clipPaths.length === 0) {
      setError('Hãy dán ít nhất 1 đường dẫn file gốc (mỗi dòng 1 file).');
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
        {r.results.map((s) => (
          <li key={s.order} className={`auto-step status-${s.status}`}>
            <span className="auto-step-icon">{STATUS_ICON[s.status] ?? '•'}</span>
            <span className="auto-step-action">{s.action}</span>
            <span className="auto-step-detail">{s.detail}</span>
          </li>
        ))}
      </ul>
      <div className="auto-counts">
        🔵 xem {r.dryRunCount} · 🟢 ghi {r.applied} · 🟡 hoãn {r.deferred} · ⚪ bỏ {r.skipped} · 🔴
        lỗi {r.failed}
      </div>
      {r.approvalNote && <div className="auto-approval-note">⚠ {r.approvalNote}</div>}
    </div>
  );

  return (
    <div className="auto-tab">
      <div className="auto-intro">
        <h2>
          ⚡ Chế độ Tự động
          <HelpButton
            title="Chế độ Tự động hoạt động thế nào?"
            lines={[
              '1. Tích các việc bạn muốn AI làm (mỗi ô là một "module").',
              '2. Dán đường dẫn các file gốc cần xử lý (mỗi dòng 1 file).',
              '3. Bấm "Xem trước" — AI hiểu nội dung + lập kế hoạch, chỉ MÔ PHỎNG, chưa ghi.',
              '4. Xem kế hoạch ổn rồi bấm "Duyệt & Ghi" — lúc này mới ghi thật (có hoàn tác).',
            ]}
            example="Tích 'Lọc clip kém' + 'Đổi tên' → AI ẩn clip hỏng và đặt tên clip theo cảnh."
          />
        </h2>
        <p className="auto-sub">AI hiểu nội dung như editor — luôn xem trước trước khi ghi.</p>
      </div>

      <section className="auto-section">
        <div className="auto-section-title">
          🎯 Mẫu nhanh (1-click)
          <HelpButton
            title="Mẫu nhanh"
            lines={['Bấm 1 nút để áp sẵn bộ module + mục tiêu tối ưu cho video Nerf.']}
            example="'Bản action nhanh' → tích sẵn lọc/tỉa/xếp/đổi-tên + mục tiêu 45s gay cấn."
          />
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

      <section className="auto-section">
        <div className="auto-section-title">
          2. File gốc cần xử lý
          <HelpButton
            title="Vì sao phải dán đường dẫn file?"
            lines={[
              'Premiere 26 không cho plugin đọc đường dẫn đầy đủ của clip trên timeline.',
              'Nên bạn dán đường dẫn file gốc — AI sẽ khớp với clip trên timeline theo tên.',
            ]}
            example="E:\\T11\\6.mp4"
          />
        </div>
        <textarea
          className="auto-cliptext"
          placeholder={'Mỗi dòng 1 đường dẫn file, ví dụ:\nE:\\T11\\6.mp4\nE:\\T11\\7.mp4'}
          value={clipText}
          onChange={(e) => {
            setClipText(e.target.value);
            setPreview(null);
            setApplied(null);
          }}
          rows={5}
        />
        <div className="auto-clipcount">{clipPaths.length} file</div>
      </section>

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

      {error && <div className="auto-error">✗ {error}</div>}

      <div className="auto-actions">
        <button className="auto-btn preview" disabled={busy} onClick={() => void run(true, false)}>
          {busy && !applied ? '⏳ Đang lập kế hoạch…' : '👁 Xem trước (không ghi)'}
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
          ✅ Duyệt &amp; Ghi
        </button>
      </div>

      {preview && !applied && renderResult(preview, '👁 Xem trước (chưa ghi gì)')}
      {applied && renderResult(applied, '✅ Đã thực thi')}
    </div>
  );
}

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
import { withTimeout, planTimeoutMs } from '../bridge/with-timeout.js';
import { useSession, type SessionPlan } from '../state/session.js';
import { ClipSourcePanel } from './ClipSourcePanel.js';
import { ColorLookPicker, type ColorLookValue, LOOKS } from './ColorLookPicker.js';
import { HelpButton } from './HelpButton.js';
import { Icon } from './Icon.js';
import { ClickBox } from './ui/primitives.js';
import './AutoTab.css';

interface ColorApplyResult {
  dryRun: boolean;
  look: string;
  intensity: number;
  total: number;
  applied: number;
  failed: number;
  details: { name?: string; look: string; params: Record<string, number>; ok: boolean }[];
}

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
  // Kế hoạch ĐẦY ĐỦ (có steps) — để "Duyệt & Ghi" dùng LẠI đúng kế hoạch đã xem
  // trước (không gọi Gemini lần 2, không lệch kế hoạch).
  plan: SessionPlan;
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
  // AT4 — phân biệt đang xem-trước vs đang ghi (nhãn nút đúng).
  const [busyKind, setBusyKind] = useState<'preview' | 'write' | null>(null);
  const busy = busyKind !== null;
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApplyResponse | null>(null);
  const [applied, setApplied] = useState<ApplyResponse | null>(null);
  // AT6 — kế hoạch đã XEM TRƯỚC (đầy đủ steps) để GHI dùng lại đúng nó.
  const [previewPlan, setPreviewPlan] = useState<SessionPlan | null>(null);

  // P2 — Sửa màu (module color_grade): look + cường độ + auto, nhớ qua reload.
  const [colorCfg, setColorCfg] = useState<ColorLookValue>(() => {
    try {
      const raw = localStorage.getItem('directorai_color');
      if (raw) return JSON.parse(raw) as ColorLookValue;
    } catch {
      // bỏ qua
    }
    return { look: 'teal_orange', intensity: 100, auto: false };
  });
  useEffect(() => {
    try {
      localStorage.setItem('directorai_color', JSON.stringify(colorCfg));
    } catch {
      // bỏ qua
    }
  }, [colorCfg]);
  const [colorBusy, setColorBusy] = useState<'preview' | 'write' | null>(null);
  const [colorRes, setColorRes] = useState<ColorApplyResult | null>(null);
  const [colorWritten, setColorWritten] = useState<boolean>(false);

  const runColor = async (dryRun: boolean): Promise<void> => {
    setError(null);
    setColorBusy(dryRun ? 'preview' : 'write');
    try {
      const r = await wsClient.call<ColorApplyResult>('color.applyLook', {
        look: colorCfg.auto ? 'auto' : colorCfg.look,
        intensity: colorCfg.intensity,
        dryRun,
        verify: !dryRun,
      });
      setColorRes(r);
      setColorWritten(!dryRun);
    } catch (e) {
      setError(`[Màu] ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setColorBusy(null);
    }
  };

  // AT1 — CHỈ clip VIDEO (loại nhạc/audio để planner không phí cost + không lẫn
  // nhạc vào kế hoạch) + KHỬ TRÙNG.
  const clipPaths = Array.from(
    new Set(
      s.clips
        .filter((c) => c.hasFullPath && c.path && c.kind !== 'audio')
        .map((c) => c.path as string)
    )
  );

  const resetPreview = (): void => {
    setPreview(null);
    setApplied(null);
    setPreviewPlan(null);
  };

  const toggle = (id: string): void => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    resetPreview();
  };

  // MOD-7 — áp template: chỉ tích module enabled trong template.
  const applyTemplate = (moduleIds: string[], goal: string): void => {
    const enabledIds = MODULES.filter((m) => m.enabled && moduleIds.includes(m.id)).map(
      (m) => m.id
    );
    setTicked(new Set(enabledIds));
    setCustomGoal(goal);
    resetPreview();
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
    setBusyKind(dryRun ? 'preview' : 'write');
    try {
      // AT6 — GHI dùng LẠI kế hoạch đã xem trước (truyền editPlan) → không gọi
      // Gemini lần 2 + ghi đúng kế hoạch đã duyệt. Preview (dry-run) mới dựng mới.
      const reusePlan = !dryRun && previewPlan;
      const params = reusePlan
        ? { editPlan: previewPlan, dryRun: false, approved: true }
        : { clipPaths, goal, dryRun, approved };
      // AT2 — timeout: chỉ cần khi PHẢI dựng kế hoạch (Gemini). Ghi dùng-lại-plan
      // (reusePlan) chỉ resolve+ghi → nhanh, để timeout rộng.
      const ms = reusePlan ? 120_000 : planTimeoutMs(clipPaths.length);
      const res = await withTimeout(
        wsClient.call<ApplyResponse>('safe.applyPlan', params),
        ms,
        dryRun ? 'Lập kế hoạch' : 'Ghi'
      );
      if (dryRun) {
        setPreview(res);
        setApplied(null);
        setPreviewPlan(res.plan ?? null);
      } else {
        setApplied(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKind(null);
    }
  };

  const renderResult = (r: ApplyResponse, title: string): React.ReactElement => (
    <div className="auto-result">
      <div className="auto-result-head">{title}</div>
      <div className="auto-plan-summary">
        <div>
          <strong>
            <Icon name="sparkles" size={13} /> Hiểu mục tiêu:
          </strong>{' '}
          {r.plan?.goal_understanding}
        </div>
        <div>
          <strong>
            <Icon name="target" size={13} /> Chiến lược:
          </strong>{' '}
          {r.plan?.strategy}
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
      {r.approvalNote && (
        <div className="auto-approval-note">
          <Icon name="alert" size={13} /> {r.approvalNote}
        </div>
      )}
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

      {ticked.has('color_grade') && (
        <section className="auto-section">
          <div className="auto-section-title">
            <Icon name="sparkles" size={15} /> Sửa màu — chọn mẫu &amp; cường độ
            <HelpButton
              title="Sửa màu từng cảnh"
              lines={[
                'Chọn mẫu màu (Trong sáng/Điện ảnh/Ấm/Lạnh…) + cường độ, hoặc bật "Tự động theo cảnh".',
                'Xem trước = đọc thông số sẽ ghi (không đổi gì). Duyệt & Ghi = áp Lumetri thật.',
                'Hoàn tác bằng Ctrl-Z trong Premiere.',
              ]}
            />
          </div>
          <ColorLookPicker
            value={colorCfg}
            onChange={(v) => {
              setColorCfg(v);
              setColorRes(null);
              setColorWritten(false);
            }}
          />
          <div className="auto-actions">
            <ClickBox
              className="auto-btn preview"
              disabled={colorBusy !== null}
              onClick={() => void runColor(true)}
            >
              {colorBusy === 'preview' ? (
                <>
                  <Icon name="refresh" size={15} className="spin" /> Đang xem trước màu…
                </>
              ) : (
                <>
                  <Icon name="eye" size={15} /> Xem trước màu
                </>
              )}
            </ClickBox>
            <ClickBox
              className="auto-btn apply"
              disabled={colorBusy !== null || !colorRes || colorWritten || s.conn !== 'connected'}
              title={
                s.conn !== 'connected'
                  ? 'Chưa kết nối Premiere'
                  : !colorRes
                    ? 'Hãy "Xem trước màu" trước'
                    : 'Ghi Lumetri thật (Ctrl-Z để hoàn tác)'
              }
              onClick={() => {
                if (window.confirm('Ghi màu Lumetri lên các clip? (Ctrl-Z để hoàn tác)')) {
                  void runColor(false);
                }
              }}
            >
              {colorBusy === 'write' ? (
                <>
                  <Icon name="refresh" size={15} className="spin" /> Đang ghi màu…
                </>
              ) : (
                <>
                  <Icon name="check" size={15} /> Duyệt &amp; Ghi màu
                </>
              )}
            </ClickBox>
          </div>
          {colorRes && (
            <div className="auto-result">
              <div className="auto-result-head">
                {colorRes.dryRun ? 'Xem trước màu (chưa ghi)' : 'Đã ghi màu'} —{' '}
                {colorCfg.auto
                  ? 'Tự động theo cảnh'
                  : (LOOKS.find((l) => l.id === colorCfg.look)?.label ?? colorCfg.look)}{' '}
                · {colorCfg.intensity}% · {colorRes.total} clip
                {!colorRes.dryRun && ` · ghi ${colorRes.applied}, lỗi ${colorRes.failed}`}
              </div>
              {colorRes.details?.[0] && (
                <div className="auto-step-detail">
                  Ví dụ {colorRes.details[0].name}: {JSON.stringify(colorRes.details[0].params)}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="auto-error">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <div className="auto-actions">
        <ClickBox
          className="auto-btn preview"
          disabled={busy}
          onClick={() => void run(true, false)}
        >
          {busyKind === 'preview' ? (
            <>
              <Icon name="refresh" size={15} className="spin" /> Đang lập kế hoạch…
            </>
          ) : (
            <>
              <Icon name="eye" size={15} /> Xem trước (không ghi)
            </>
          )}
        </ClickBox>
        <ClickBox
          className="auto-btn apply"
          disabled={busy || !preview || s.conn !== 'connected'}
          title={
            s.conn !== 'connected'
              ? 'Chưa kết nối Premiere'
              : !preview
                ? 'Hãy "Xem trước" rồi mới ghi'
                : 'Ghi thật (có hoàn tác)'
          }
          onClick={() => {
            if (window.confirm('Ghi thật lên timeline? (có thể Undo trong Premiere)')) {
              void run(false, true);
            }
          }}
        >
          {busyKind === 'write' ? (
            <>
              <Icon name="refresh" size={15} className="spin" /> Đang ghi…
            </>
          ) : (
            <>
              <Icon name="check" size={15} /> Duyệt &amp; Ghi
            </>
          )}
        </ClickBox>
      </div>

      {preview && !applied && renderResult(preview, 'Xem trước (chưa ghi gì)')}
      {applied && renderResult(applied, 'Đã thực thi')}
    </div>
  );
}

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

import React, { useState, useEffect } from 'react';
import {
  MODULE_REGISTRY,
  moduleInfo,
  buildGoalFromModules,
  NERF_TEMPLATES,
} from '@directorai/modules';
import { wsClient } from '../bridge/ws-client.js';
import { parseClipPaths } from '../bridge/clip-paths.js';
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

  const clipPaths = parseClipPaths(clipText);

  // Auto-connect — TỰ nạp clip từ sequence đang mở (không nhập tay).
  const [seqInfo, setSeqInfo] = useState<{
    name: string;
    total: number;
    withFullPath: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFromSequence = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const r = await wsClient.call<{
        sequenceName: string;
        clips: { name: string; path: string; hasFullPath: boolean }[];
        total: number;
        withFullPath: number;
      }>('context.activeSequenceClips', {});
      // Ưu tiên path đầy đủ (AI đọc được); nếu không có path thì dùng tên.
      const lines = r.clips.map((c) => (c.hasFullPath ? c.path : c.name));
      setClipText(lines.join('\n'));
      setSeqInfo({ name: r.sequenceName, total: r.total, withFullPath: r.withFullPath });
      setPreview(null);
      setApplied(null);
    } catch (e) {
      setError(`Không nạp được clip từ sequence: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // D4 — quét thư mục gốc → map tên clip → đường dẫn đầy đủ (cho AI đọc file).
  const [folderText, setFolderText] = useState('');
  const [scanInfo, setScanInfo] = useState<{
    resolved: number;
    unresolved: number;
    files: number;
  } | null>(null);

  const scanFolders = async (): Promise<void> => {
    const folders = parseClipPaths(folderText);
    if (folders.length === 0) {
      setError('Hãy nhập ít nhất 1 thư mục gốc (mỗi dòng 1 folder).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await wsClient.call<{
        resolved: { name: string; fullPath: string }[];
        unresolved: string[];
        filesIndexed: number;
      }>('context.resolveFromFolders', { folders });
      setClipText(r.resolved.map((c) => c.fullPath).join('\n'));
      setScanInfo({
        resolved: r.resolved.length,
        unresolved: r.unresolved.length,
        files: r.filesIndexed,
      });
      setSeqInfo(null);
      setPreview(null);
      setApplied(null);
    } catch (e) {
      setError(`Quét thư mục lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // Tự nạp 1 lần khi mở tab (nếu WS đã kết nối). loadFromSequence ổn định.
  useEffect(() => {
    void loadFromSequence();
  }, []);

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
          2. Clip từ sequence đang mở
          <HelpButton
            title="Tự nạp clip"
            lines={[
              'Plugin TỰ lấy clip từ sequence bạn đang mở trong Premiere — không cần nhập tay.',
              'Bấm "Nạp lại" sau khi đổi sequence. Nếu Premiere không cho đường dẫn đầy đủ,',
              'AI vẫn khớp clip theo tên để thao tác timeline (tắt/đổi tên/tỉa/xếp).',
            ]}
          />
        </div>
        <button
          type="button"
          className="auto-template-btn"
          disabled={loading}
          onClick={() => void loadFromSequence()}
          style={{ marginBottom: 8 }}
        >
          {loading ? '⏳ Đang nạp…' : '🔄 Nạp lại clip từ sequence'}
        </button>
        {seqInfo && (
          <div className="auto-seqinfo">
            📺 <b>{seqInfo.name || '(sequence đang mở)'}</b> — {seqInfo.total} clip
            {seqInfo.withFullPath > 0 ? (
              <span> · {seqInfo.withFullPath} có đường dẫn đầy đủ (AI đọc được)</span>
            ) : (
              <span className="auto-warn">
                {' '}
                · ⚠ chỉ có TÊN clip → thao tác timeline OK; muốn AI phân tích, quét thư mục gốc bên
                dưới
              </span>
            )}
          </div>
        )}
        <div className="auto-folderbox">
          <div className="auto-folder-label">
            📁 Thư mục gốc (cho AI đọc file — nhiều folder, mỗi dòng 1)
            <HelpButton
              title="Quét thư mục gốc"
              lines={[
                'Premiere không cho plugin đường dẫn file → bạn chỉ thư mục chứa video/music/fx.',
                'Quét 1 lần, plugin tự map tên clip → đường dẫn đầy đủ để AI phân tích.',
              ]}
              example="E:\\T11"
            />
          </div>
          <textarea
            className="auto-cliptext"
            placeholder={'Mỗi dòng 1 thư mục, vd:\nE:\\T11\nE:\\Music'}
            value={folderText}
            onChange={(e) => setFolderText(e.target.value)}
            rows={2}
          />
          <button
            type="button"
            className="auto-template-btn"
            disabled={loading}
            onClick={() => void scanFolders()}
            style={{ marginTop: 6 }}
          >
            {loading ? '⏳ Đang quét…' : '🔍 Quét thư mục → map đường dẫn'}
          </button>
          {scanInfo && (
            <div className="auto-seqinfo" style={{ marginTop: 6 }}>
              🔍 Quét {scanInfo.files} file → khớp <b>{scanInfo.resolved}</b> clip
              {scanInfo.unresolved > 0 && (
                <span className="auto-warn"> · {scanInfo.unresolved} chưa khớp</span>
              )}
            </div>
          )}
        </div>
        <textarea
          className="auto-cliptext"
          placeholder={'Tự nạp khi mở tab. Hoặc dán tay (mỗi dòng 1 path/tên):\nE:\\T11\\6.mp4'}
          value={clipText}
          onChange={(e) => {
            setClipText(e.target.value);
            setPreview(null);
            setApplied(null);
          }}
          rows={4}
        />
        <div className="auto-clipcount">{clipPaths.length} mục</div>
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

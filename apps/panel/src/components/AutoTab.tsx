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
import { SpeedPanel, type SpeedSettings, DEFAULT_SPEED } from './SpeedPanel.js';
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

// SPEED P4 — 1 hàng kết quả tốc độ (khớp SpeedRenderRow phía server).
interface SpeedRow {
  path: string;
  speed: number;
  category: string;
  action: string;
  reason?: string;
  out_path?: string;
  expected_duration?: number | null;
  ok?: boolean;
  verify?: { out_duration?: number; out_fps?: number; dur_ok?: boolean; fps_ok?: boolean };
}
interface SpeedResult {
  results: SpeedRow[];
  summary: {
    n_slowmo: number;
    n_speedup: number;
    n_keep: number;
    n_fps_gated: number;
    rendered?: number;
    skipped?: number;
    failed?: number;
    dry_run?: boolean;
    total_in_sec: number;
    total_out_sec: number;
    thresholds: { p_lo: number; p_hi: number };
  };
}

// P0 ASM — kết quả dựng phim (khớp AssembleResult phía server).
interface AssembleResult {
  ok: boolean;
  out_path: string;
  duration_sec?: number;
  clips?: number;
  width?: number;
  height?: number;
  fps?: number;
  dropped?: string[];
  notes?: string[];
  error?: string;
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

  // SPEED P4 — Điều chỉnh tốc độ (module speed_adjust): cài đặt nhớ qua reload.
  const [speedCfg, setSpeedCfg] = useState<SpeedSettings>(() => {
    try {
      const raw = localStorage.getItem('directorai_speed');
      if (raw) return { ...DEFAULT_SPEED, ...(JSON.parse(raw) as Partial<SpeedSettings>) };
    } catch {
      // bỏ qua
    }
    return DEFAULT_SPEED;
  });
  useEffect(() => {
    try {
      localStorage.setItem('directorai_speed', JSON.stringify(speedCfg));
    } catch {
      // bỏ qua
    }
  }, [speedCfg]);
  const [speedBusy, setSpeedBusy] = useState<'preview' | 'render' | null>(null);
  const [speedRes, setSpeedRes] = useState<SpeedResult | null>(null);
  const [speedRendered, setSpeedRendered] = useState<boolean>(false);

  const runSpeed = async (dryRun: boolean): Promise<void> => {
    setError(null);
    if (clipPaths.length === 0) {
      setError('Chưa có clip có đường dẫn — bấm "Lấy path tự động" ở mục Nguồn clip.');
      return;
    }
    setSpeedBusy(dryRun ? 'preview' : 'render');
    try {
      // Render thật có thể lâu (re-encode từng clip) → timeout rộng theo số clip.
      const ms = dryRun ? 120_000 : Math.max(180_000, clipPaths.length * 60_000);
      const r = await withTimeout(
        wsClient.call<SpeedResult>('speed.render', {
          clipPaths,
          mode: speedCfg.mode,
          slowmoFloor: speedCfg.slowmoFloor,
          speedupCeiling: speedCfg.speedupCeiling,
          smoothFps: speedCfg.smoothFps,
          targetDurationSec: speedCfg.targetDurationSec,
          dryRun,
          skipUnity: true,
        }),
        ms,
        dryRun ? 'Xem trước tốc độ' : 'Render tốc độ'
      );
      setSpeedRes(r);
      setSpeedRendered(!dryRun);
    } catch (e) {
      setError(`[Tốc độ] ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSpeedBusy(null);
    }
  };

  // P0 ASM — Dựng thành 1 PHIM hoàn chỉnh (xuất MP4 qua Lane-B, né insert PPro26).
  const [asmSpeed, setAsmSpeed] = useState<boolean>(true);
  const [asmDeadAir, setAsmDeadAir] = useState<boolean>(false);
  const [asmBusy, setAsmBusy] = useState<boolean>(false);
  const [asmRes, setAsmRes] = useState<AssembleResult | null>(null);

  const runAssemble = async (): Promise<void> => {
    setError(null);
    if (clipPaths.length < 2) {
      setError('Cần ít nhất 2 clip (lấy path ở mục Nguồn clip) để dựng thành phim.');
      return;
    }
    setAsmBusy(true);
    setAsmRes(null);
    try {
      // Re-encode từng clip → có thể lâu; timeout rộng theo số clip.
      const ms = Math.max(180_000, clipPaths.length * 45_000);
      const r = await withTimeout(
        wsClient.call<AssembleResult>('assemble.auto', {
          clipPaths,
          withSpeed: asmSpeed,
          withDeadAir: asmDeadAir,
        }),
        ms,
        'Dựng phim'
      );
      setAsmRes(r);
    } catch (e) {
      setError(`[Dựng phim] ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAsmBusy(false);
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

      <section className="auto-section auto-assemble">
        <div className="auto-section-title">
          <Icon name="clapperboard" size={15} /> Dựng thành 1 phim hoàn chỉnh (xuất MP4)
          <HelpButton
            title="Dựng phim tự động → xuất MP4"
            lines={[
              'Ghép các clip (theo thứ tự nguồn) thành 1 video hoàn chỉnh, không cần dựng tay.',
              'AI/CV tự chỉnh tốc độ + cắt khoảng lặng nếu bạn bật. Giữ pitch tiếng.',
              'Xuất ra file MP4 cạnh clip gốc — KHÔNG đụng timeline; bạn tự kéo vào Premiere.',
              'Đây là đường "dựng phim" chạy chắc chắn (không vướng giới hạn chèn clip của Premiere 26).',
            ]}
          />
        </div>
        <div className="auto-asm-opts">
          <label>
            <input
              type="checkbox"
              checked={asmSpeed}
              onChange={(e) => setAsmSpeed((e.target as HTMLInputElement).checked)}
            />
            <span>Tự chỉnh tốc độ (slow-mo cảnh động, tua cảnh tĩnh)</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={asmDeadAir}
              onChange={(e) => setAsmDeadAir((e.target as HTMLInputElement).checked)}
            />
            <span>Cắt khoảng lặng đầu/cuối mỗi clip</span>
          </label>
        </div>
        <ClickBox
          className="auto-btn apply"
          disabled={asmBusy || clipPaths.length < 2 || s.conn !== 'connected'}
          title={
            s.conn !== 'connected'
              ? 'Chưa kết nối'
              : clipPaths.length < 2
                ? 'Cần ≥2 clip (lấy path ở Nguồn clip)'
                : 'Ghép thành 1 phim MP4'
          }
          onClick={() => void runAssemble()}
        >
          {asmBusy ? (
            <>
              <Icon name="refresh" size={15} className="spin" /> Đang dựng phim… (có thể vài phút)
            </>
          ) : (
            <>
              <Icon name="film" size={15} /> Dựng &amp; Xuất phim ({clipPaths.length} clip)
            </>
          )}
        </ClickBox>
        {asmRes && asmRes.ok && (
          <div className="auto-result">
            <div className="auto-result-head">
              <Icon name="check" size={13} /> Đã xuất phim · {asmRes.clips} clip ·{' '}
              {asmRes.duration_sec?.toFixed(1)}s · {asmRes.width}×{asmRes.height}@{asmRes.fps}fps
            </div>
            <div className="auto-step-detail">{asmRes.out_path}</div>
            {asmRes.notes && asmRes.notes.length > 0 && (
              <div className="auto-step-detail">{asmRes.notes.join(' · ')}</div>
            )}
            {asmRes.dropped && asmRes.dropped.length > 0 && (
              <div className="auto-step-detail">Bỏ {asmRes.dropped.length} clip lặng</div>
            )}
          </div>
        )}
      </section>

      {ticked.has('speed_adjust') && (
        <section className="auto-section">
          <div className="auto-section-title">
            <Icon name="zap" size={15} /> Điều chỉnh tốc độ — slow-mo / tua nhanh
            <HelpButton
              title="Điều chỉnh tốc độ từng cảnh"
              lines={[
                'AI đo độ "động" mỗi clip → cảnh đấu súng SLOW-MO, cảnh tĩnh TUA NHANH.',
                'Ngưỡng lấy từ chính bộ clip của bạn; giữ pitch tiếng (atempo).',
                'Xem trước = bảng tốc độ (chưa render). Render = xuất file mới cạnh clip gốc.',
                'KHÔNG đụng timeline — bạn tự kéo file đã render vào.',
              ]}
            />
          </div>
          <SpeedPanel
            value={speedCfg}
            onChange={(v) => {
              setSpeedCfg(v);
              setSpeedRes(null);
              setSpeedRendered(false);
            }}
          />
          <div className="auto-actions">
            <ClickBox
              className="auto-btn preview"
              disabled={speedBusy !== null}
              onClick={() => void runSpeed(true)}
            >
              {speedBusy === 'preview' ? (
                <>
                  <Icon name="refresh" size={15} className="spin" /> Đang đo &amp; tính tốc độ…
                </>
              ) : (
                <>
                  <Icon name="eye" size={15} /> Xem trước tốc độ
                </>
              )}
            </ClickBox>
            <ClickBox
              className="auto-btn apply"
              disabled={speedBusy !== null || !speedRes || speedRendered || s.conn !== 'connected'}
              title={
                s.conn !== 'connected'
                  ? 'Chưa kết nối Premiere'
                  : !speedRes
                    ? 'Hãy "Xem trước tốc độ" trước'
                    : 'Render file tốc độ mới (cạnh clip gốc)'
              }
              onClick={() => {
                if (
                  window.confirm('Render file tốc độ mới? (ghi cạnh clip gốc, không đụng timeline)')
                ) {
                  void runSpeed(false);
                }
              }}
            >
              {speedBusy === 'render' ? (
                <>
                  <Icon name="refresh" size={15} className="spin" /> Đang render…
                </>
              ) : (
                <>
                  <Icon name="check" size={15} /> Render tốc độ
                </>
              )}
            </ClickBox>
          </div>
          {speedRes && (
            <div className="auto-result">
              <div className="auto-result-head">
                {speedRes.summary.dry_run ? 'Xem trước tốc độ (chưa render)' : 'Đã render tốc độ'} ·{' '}
                {speedRes.summary.n_slowmo} chậm · {speedRes.summary.n_speedup} nhanh ·{' '}
                {speedRes.summary.n_keep} giữ
                {speedRes.summary.n_fps_gated > 0 && ` · ${speedRes.summary.n_fps_gated} chặn-fps`}
                {!speedRes.summary.dry_run &&
                  ` · render ${speedRes.summary.rendered ?? 0}, lỗi ${speedRes.summary.failed ?? 0}`}
              </div>
              <table className="speed-table">
                <thead>
                  <tr>
                    <th>Clip</th>
                    <th>Tốc độ</th>
                    <th>Loại</th>
                    <th>Độ dài</th>
                  </tr>
                </thead>
                <tbody>
                  {speedRes.results.map((r) => {
                    const name = r.path.split(/[/\\]/).pop() ?? r.path;
                    const dur = r.verify?.out_duration ?? r.expected_duration ?? null;
                    const cat =
                      r.category === 'slowmo'
                        ? '🐢 chậm'
                        : r.category === 'speedup'
                          ? '⚡ nhanh'
                          : r.category === 'keep'
                            ? '➖ giữ'
                            : '⚠️ lỗi';
                    return (
                      <tr key={r.path}>
                        <td title={r.reason ?? ''}>{name}</td>
                        <td
                          className={
                            r.category === 'slowmo'
                              ? 'sp-slow'
                              : r.category === 'speedup'
                                ? 'sp-fast'
                                : ''
                          }
                        >
                          {r.speed.toFixed(2)}×
                        </td>
                        <td>{cat}</td>
                        <td>{dur != null ? `${dur.toFixed(1)}s` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

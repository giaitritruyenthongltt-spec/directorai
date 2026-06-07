/**
 * UI4 + R4 — Tab "🎞️ Phim dài": MỘT luồng dựng phim Nerf điện ảnh.
 *
 * Nguồn clip + map path nay DÙNG CHUNG qua useSession (map 1 lần → mọi tab
 * thấy, đổi tab KHÔNG mất). Tab này chỉ giữ state riêng cho bước lập kế hoạch.
 */

import React, { useEffect, useState } from 'react';
import { NERF_TEMPLATES, type EditTemplate } from '@directorai/modules';
import { wsClient } from '../bridge/ws-client.js';
import { withTimeout, planTimeoutMs } from '../bridge/with-timeout.js';
import { useSession, type SessionPlan } from '../state/session.js';
import { Section, Button, ErrorBox } from './ui/primitives.js';
import { Icon } from './Icon.js';
import { ClipSourcePanel } from './ClipSourcePanel.js';
import { ChapterTimeline } from './ChapterTimeline.js';
import './FilmTab.css';

const LONG_TEMPLATES = NERF_TEMPLATES.filter((t) => t.kind === 'long');

interface ApplyResponse {
  dryRun: boolean;
  total: number;
  applied: number;
  failed: number;
  deferred: number;
  skipped: number; // FB3 — bước không khớp clip trên timeline
  dryRunCount: number; // FB4 — bước "sẽ ghi" khi xem trước
  approvalNote?: string;
}

export function FilmTab(): React.ReactElement {
  const s = useSession();
  const [tplId, setTplId] = useState<string>(LONG_TEMPLATES[0]?.id ?? '');
  const [deadAir, setDeadAir] = useState<{ trims: number; disables: number; saved: number } | null>(
    null
  );
  const [applyRes, setApplyRes] = useState<ApplyResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // G5 — bước bị bỏ (theo order) — không ghi.
  const [skip, setSkip] = useState<Set<number>>(new Set());
  // A6 — tuỳ chỉnh ngoài template (0 = dùng mặc định của template).
  const [ovrDurationMin, setOvrDurationMin] = useState<number>(0);
  const [ovrKeepPct, setOvrKeepPct] = useState<number>(0);
  // B4 — tiến độ per-clip khi lập kế hoạch (Gemini Vision từng clip) + Hủy.
  const [planProg, setPlanProg] = useState<{ done: number; total: number } | null>(null);
  const [planOpId, setPlanOpId] = useState<string | null>(null);
  // A2 — gợi ý thứ tự clip theo mạch phim (áp vào buildPlan khi dựng).
  const [orderRows, setOrderRows] = useState<
    { path: string; reason: string; phaseVi: string; actionLevel: number }[] | null
  >(null);
  const [orderStrategy, setOrderStrategy] = useState<string>('');
  useEffect(() => {
    const off = wsClient.onProgress((evt) => {
      if (evt.kind === 'start' && evt.method === 'context.buildEditPlan') {
        setPlanOpId(evt.opId);
        setPlanProg({ done: 0, total: evt.total ?? 0 });
      } else if (evt.kind === 'update') {
        setPlanOpId((cur) => {
          if (cur && evt.opId === cur) setPlanProg({ done: evt.done ?? 0, total: evt.total ?? 0 });
          return cur;
        });
      } else if (evt.kind === 'end') {
        setPlanOpId((cur) => (evt.opId === cur ? null : cur));
        setPlanProg(null);
      }
    });
    return off;
  }, []);

  const tpl: EditTemplate | undefined = LONG_TEMPLATES.find((t) => t.id === tplId);
  const plan = s.editPlan;
  // FB2+FB10 — planner & dead-air CHỈ nhận clip VIDEO (loại nhạc/audio để dead-air
  // không tỉa nhạc nền + Vision không phí cost trên file audio) + KHỬ TRÙNG.
  const clipPaths = Array.from(
    new Set(
      s.clips
        .filter((c) => c.hasFullPath && c.path && c.kind !== 'audio')
        .map((c) => c.path as string)
    )
  );
  const ACTION_VN: Record<string, string> = {
    disable: 'Ẩn',
    trim: 'Tỉa',
    move: 'Dời',
    rename: 'Đổi tên',
    transition: 'Chuyển cảnh',
  };
  const toggleSkip = (order: number): void =>
    setSkip((prev) => {
      const n = new Set(prev);
      if (n.has(order)) n.delete(order);
      else n.add(order);
      return n;
    });

  // ── Lập kế hoạch phim (planner LF) — dùng clip path đã map ở context ───────
  const buildPlan = async (): Promise<void> => {
    if (clipPaths.length === 0) {
      setError('Chưa có clip nào có đường dẫn — bấm "Lấy path tự động" ở mục Nguồn clip.');
      return;
    }
    if (!tpl) {
      setError('Hãy chọn một kiểu phim.');
      return;
    }
    setBusy('plan');
    setError(null);
    setApplyRes(null);
    try {
      // A2 — nếu đã có gợi ý thứ tự, dựng theo thứ tự đó (lọc về clip hiện có).
      const ordered = orderRows
        ? orderRows.map((o) => o.path).filter((p) => clipPaths.includes(p))
        : null;
      const planClipPaths = ordered && ordered.length === clipPaths.length ? ordered : clipPaths;
      // Timeout co giãn theo số clip (Vision chạy từng clip).
      const ms = planTimeoutMs(clipPaths.length);
      const r = await withTimeout(
        wsClient.call<{ edit_plan: SessionPlan }>('context.buildEditPlan', {
          clipPaths: planClipPaths,
          goal: tpl.goal,
          // A6 — override người dùng (nếu >0), nếu không dùng mặc định template.
          targetDurationSec:
            ovrDurationMin > 0 ? ovrDurationMin * 60 : tpl.longform?.targetDurationSec,
          keepRatio: ovrKeepPct > 0 ? ovrKeepPct / 100 : tpl.longform?.keepRatio,
          pacingProfile: tpl.longform?.pacingProfile,
          structure: tpl.longform?.structure,
        }),
        ms,
        'Lập kế hoạch'
      );
      s.setEditPlan(r.edit_plan);
      setSkip(new Set());
      setDeadAir(null);
    } catch (e) {
      setError(`Lập kế hoạch lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // ── Cắt dead-air ──────────────────────────────────────────────────────────
  const planDeadAir = async (): Promise<void> => {
    if (clipPaths.length === 0) {
      setError('Chưa có clip có đường dẫn — bấm "Lấy path tự động" ở mục Nguồn clip.');
      return;
    }
    setBusy('deadair');
    setError(null);
    try {
      const ms = planTimeoutMs(clipPaths.length, 60_000, 3000);
      const r = await withTimeout(
        wsClient.call<{
          edit_plan: SessionPlan;
          total_trims: number;
          total_disables: number;
          estimated_saved_sec: number;
        }>('context.planDeadAir', { clipPaths }),
        ms,
        'Cắt khoảng chết'
      );
      s.setEditPlan(r.edit_plan);
      setSkip(new Set());
      setDeadAir({
        trims: r.total_trims,
        disables: r.total_disables,
        saved: r.estimated_saved_sec,
      });
    } catch (e) {
      setError(`Cắt dead-air lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // ── A2: Gợi ý thứ tự dựng theo mạch phim ───────────────────────────────────
  const suggestOrder = async (): Promise<void> => {
    if (clipPaths.length === 0) {
      setError('Chưa có clip có đường dẫn — bấm "Lấy path tự động" ở mục Nguồn clip.');
      return;
    }
    setBusy('order');
    setError(null);
    try {
      const ms = planTimeoutMs(clipPaths.length, 60_000, 4000);
      const r = await withTimeout(
        wsClient.call<{
          order: { path: string; reason: string; phaseVi: string; actionLevel: number }[];
          strategy: string;
        }>('context.suggestOrder', { clipPaths, goal: tpl?.goal }),
        ms,
        'Gợi ý thứ tự'
      );
      setOrderRows(r.order ?? null);
      setOrderStrategy(r.strategy ?? '');
    } catch (e) {
      setError(`Gợi ý thứ tự lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // ── Xem trước / Ghi ───────────────────────────────────────────────────────
  const apply = async (write: boolean): Promise<void> => {
    if (!plan) return;
    // G5 — chỉ ghi các bước CHƯA bị bỏ.
    const steps = (plan.steps ?? []).filter((st) => !skip.has(st.order));
    if (steps.length === 0) {
      setError('Không còn bước nào (đã bỏ hết) — bỏ tick bớt để ghi.');
      return;
    }
    const effectivePlan = { ...plan, steps };
    setBusy(write ? 'apply' : 'preview');
    setError(null);
    try {
      const res = await wsClient.call<ApplyResponse>('safe.applyPlan', {
        editPlan: effectivePlan,
        dryRun: !write,
        approved: write,
      });
      setApplyRes(res);
    } catch (e) {
      setError(`${write ? 'Ghi' : 'Xem trước'} lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const fmt = (n: number): string => {
    const m = Math.floor(n / 60);
    const sec = Math.round(n % 60);
    return m ? `${m} phút ${sec} giây` : `${sec} giây`;
  };

  return (
    <div className="film-tab">
      <div className="film-intro">
        <h2>
          <Icon name="film" size={18} /> Dựng phim Nerf dài
        </h2>
        <p className="film-sub">
          Nạp clip → chọn kiểu phim → lập kế hoạch theo chương → cắt khoảng chết → duyệt → ghi. An
          toàn, hoàn tác được.
        </p>
      </div>

      <ErrorBox error={error} />

      {/* 1. Nguồn clip — DÙNG CHUNG (map 1 lần, mọi tab thấy) */}
      <ClipSourcePanel />

      {/* 2. Kiểu phim */}
      <Section title="2. Kiểu phim" iconName="clapperboard">
        <div className="film-templates">
          {LONG_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className={`film-tpl${tplId === t.id ? ' on' : ''}`}
              onClick={() => setTplId(t.id)}
              title={t.description}
            >
              <span className="film-tpl-icon">{t.icon}</span>
              <span className="film-tpl-name">{t.name}</span>
            </button>
          ))}
        </div>
        {tpl && <p className="film-tpl-desc">{tpl.description}</p>}
        <details className="film-folder-adv">
          <summary>… Tuỳ chỉnh nâng cao (ghi đè template)</summary>
          <div className="film-row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <label className="film-ovr">
              Thời lượng mục tiêu
              <input
                type="number"
                min="0"
                step="0.5"
                value={ovrDurationMin}
                onChange={(e) => setOvrDurationMin(Number(e.target.value) || 0)}
              />
              phút (0 = theo template)
            </label>
            <label className="film-ovr">
              Tỉ lệ giữ clip
              <input
                type="number"
                min="0"
                max="100"
                step="5"
                value={ovrKeepPct}
                onChange={(e) => setOvrKeepPct(Number(e.target.value) || 0)}
              />
              % (0 = theo template)
            </label>
          </div>
        </details>
      </Section>

      {/* 3. Lập kế hoạch */}
      <Section title="3. Lập kế hoạch" iconName="sparkles">
        <div className="film-row">
          <Button
            variant="primary"
            iconName="sparkles"
            onClick={() => void buildPlan()}
            busy={busy === 'plan'}
            disabled={!clipPaths.length}
          >
            Lập kế hoạch phim
          </Button>
          <Button
            iconName="scissors"
            onClick={() => void planDeadAir()}
            busy={busy === 'deadair'}
            disabled={!clipPaths.length}
          >
            Cắt khoảng chết (dead-air)
          </Button>
          <Button
            iconName="list"
            onClick={() => void suggestOrder()}
            busy={busy === 'order'}
            disabled={!clipPaths.length}
          >
            Gợi ý thứ tự (AI)
          </Button>
        </div>

        {orderRows && orderRows.length > 0 && (
          <div className="film-order">
            <div className="film-note">
              <Icon name="list" size={14} /> {orderStrategy} — sẽ dựng theo thứ tự này:
            </div>
            <ol className="film-order-list">
              {orderRows.map((o) => (
                <li key={o.path}>
                  <b>{o.phaseVi}</b> · {o.path.split(/[\\/]/).pop()} —{' '}
                  <span className="film-order-reason">{o.reason}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {(busy === 'plan' || busy === 'deadair') && (
          <div className="film-note">
            {busy === 'plan' && planProg && planProg.total > 0
              ? `Đang phân tích ${planProg.done}/${planProg.total} clip…`
              : `Đang phân tích ${clipPaths.length} clip…`}{' '}
            (AI chạy từng clip, có thể vài phút — đừng đóng panel)
            {busy === 'plan' && planOpId && (
              <>
                {' '}
                <Button iconName="stop" onClick={() => void wsClient.cancelOp(planOpId)}>
                  Hủy
                </Button>
              </>
            )}
          </div>
        )}

        {deadAir && (
          <div className="film-deadair">
            <Icon name="scissors" size={14} /> Cắt dead-air: tỉa <b>{deadAir.trims}</b> clip · ẩn{' '}
            <b>{deadAir.disables}</b> clip · bỏ ~<b>{fmt(deadAir.saved)}</b> thời lượng chết.
          </div>
        )}

        {plan?.chapters && plan.chapters.length > 0 && (
          <ChapterTimeline
            chapters={plan.chapters}
            totalTargetSec={plan.total_target_duration_sec}
          />
        )}

        {plan && (
          <div className="film-plan">
            <div className="film-plan-strategy">{plan.strategy}</div>
            <div className="film-plan-count">
              {plan.steps?.length ?? 0} bước
              {plan.estimated_kept_clips ? ` · giữ ~${plan.estimated_kept_clips} clip` : ''}
            </div>
            {plan.truncated && (
              <div className="film-warn">
                <Icon name="alert" size={14} />{' '}
                {plan.truncation_note ??
                  'Kế hoạch dài vượt trần token nên chỉ giữ các bước đã sinh xong — hãy lọc bớt clip rồi lập lại để có kế hoạch đầy đủ.'}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* 4. Duyệt & Ghi */}
      {plan && (
        <Section title="4. Duyệt & Ghi" iconName="check">
          {plan.steps && plan.steps.length > 0 && (
            <div className="film-steps">
              <div className="film-steps-head">
                Sẽ ghi <b>{plan.steps.length - skip.size}</b>/{plan.steps.length} bước (bỏ tick để
                loại bước không muốn):
              </div>
              <ul className="film-steplist">
                {plan.steps.map((st) => (
                  <li key={st.order} className={skip.has(st.order) ? 'off' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!skip.has(st.order)}
                        onChange={() => toggleSkip(st.order)}
                      />
                      <span className="film-step-act">{ACTION_VN[st.action] ?? st.action}</span>
                      <span className="film-step-reason" title={st.target_path}>
                        {st.reason}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="film-row">
            <Button
              iconName="eye"
              onClick={() => void apply(false)}
              busy={busy === 'preview'}
              disabled={s.conn !== 'connected'}
            >
              Xem trước
            </Button>
            <Button
              variant="primary"
              iconName="check"
              onClick={() => void apply(true)}
              busy={busy === 'apply'}
              disabled={s.conn !== 'connected'}
            >
              Duyệt & Ghi
            </Button>
          </div>
          {s.conn !== 'connected' && (
            <div className="film-note">Chưa kết nối Premiere — mở panel trong Premiere để ghi.</div>
          )}
          {applyRes && (
            <div className="film-result">
              <Icon name={applyRes.dryRun ? 'eye' : 'check'} size={14} />{' '}
              {applyRes.dryRun
                ? `Xem trước: sẽ ghi ${applyRes.dryRunCount} bước`
                : `Đã ghi: ${applyRes.applied} áp dụng`}
              {applyRes.failed > 0 ? ` · ${applyRes.failed} lỗi` : ''}
              {applyRes.skipped > 0 ? ` · ${applyRes.skipped} không khớp` : ''}
              {applyRes.deferred > 0 ? ` · ${applyRes.deferred} hoãn` : ''} / {applyRes.total} bước.
              {applyRes.skipped > 0 && (
                <div className="film-note">
                  ⚠ {applyRes.skipped} bước không khớp clip nào — kiểm tra đã bấm "Lấy path tự động"
                  và đang mở đúng sequence chưa.
                </div>
              )}
              {applyRes.approvalNote && <div className="film-note">{applyRes.approvalNote}</div>}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

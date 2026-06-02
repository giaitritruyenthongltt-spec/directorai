/**
 * UI4 — Tab "🎬 Phim dài": MỘT luồng mạch lạc cho dựng phim Nerf điện ảnh.
 *
 *   Nạp clip (tự/ quét thư mục) → chọn kiểu phim (template long-form) →
 *   Lập kế hoạch (planner LF) → xem CẤU TRÚC CHƯƠNG + cắt dead-air →
 *   Xem trước → Duyệt & Ghi (an toàn, hoàn tác được).
 *
 * Gộp các mảnh rời (Auto/Director/Style) thành 1 nơi, dùng component chuẩn
 * (UI2) + ChapterTimeline (UI5) + ClipTable (UI6).
 */

import React, { useEffect, useState } from 'react';
import { NERF_TEMPLATES, type EditTemplate } from '@directorai/modules';
import { wsClient } from '../bridge/ws-client.js';
import { parseClipPaths } from '../bridge/clip-paths.js';
import { Section, Button, Badge, ErrorBox, EmptyState } from './ui/primitives.js';
import { ChapterTimeline, type ChapterView } from './ChapterTimeline.js';
import { ClipTable, type ClipRow } from './ClipTable.js';
import './FilmTab.css';

const LONG_TEMPLATES = NERF_TEMPLATES.filter((t) => t.kind === 'long');

interface EditStep {
  order: number;
  action: string;
  target_path: string;
  reason: string;
}
interface EditPlan {
  goal_understanding: string;
  strategy: string;
  steps: EditStep[];
  chapters?: ChapterView[];
  total_target_duration_sec?: number;
  estimated_kept_clips?: number;
}
interface ApplyResponse {
  dryRun: boolean;
  total: number;
  applied: number;
  failed: number;
  deferred: number;
  approvalNote?: string;
}

export function FilmTab(): React.ReactElement {
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [seqName, setSeqName] = useState<string>('');
  const [folderText, setFolderText] = useState('');
  const [tplId, setTplId] = useState<string>(LONG_TEMPLATES[0]?.id ?? '');
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [deadAir, setDeadAir] = useState<{ trims: number; disables: number; saved: number } | null>(
    null
  );
  const [applyRes, setApplyRes] = useState<ApplyResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tpl: EditTemplate | undefined = LONG_TEMPLATES.find((t) => t.id === tplId);
  const clipPaths = clips.filter((c) => c.hasFullPath && c.path).map((c) => c.path as string);

  // ── Nạp clip từ sequence đang mở ──────────────────────────────────────────
  const loadFromSequence = async (): Promise<void> => {
    setBusy('load');
    setError(null);
    try {
      const r = await wsClient.call<{
        sequenceName: string;
        clips: { id?: string; name: string; path: string; hasFullPath: boolean; kind?: string }[];
        total: number;
      }>('context.activeSequenceClips', {});
      setClips(
        r.clips.map((c) => ({
          id: c.id,
          name: c.name,
          path: c.path,
          kind: c.kind,
          hasFullPath: c.hasFullPath,
        }))
      );
      setSeqName(r.sequenceName);
      setPlan(null);
      setDeadAir(null);
      setApplyRes(null);
    } catch (e) {
      setError(`Không nạp được clip: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void loadFromSequence();
  }, []);

  // ── Quét thư mục gốc → map full path ──────────────────────────────────────
  const scanFolders = async (): Promise<void> => {
    const folders = parseClipPaths(folderText);
    if (folders.length === 0) {
      setError('Nhập ít nhất 1 thư mục gốc (mỗi dòng 1 folder).');
      return;
    }
    setBusy('scan');
    setError(null);
    try {
      const r = await wsClient.call<{
        resolved: { name: string; fullPath: string }[];
        unresolved: string[];
      }>('context.resolveFromFolders', { folders });
      const byName = new Map(r.resolved.map((x) => [x.name.toLowerCase(), x.fullPath]));
      setClips((prev) =>
        prev.map((c) => {
          const full = byName.get(c.name.toLowerCase());
          return full ? { ...c, path: full, hasFullPath: true } : c;
        })
      );
    } catch (e) {
      setError(`Quét thư mục lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  // ── Lập kế hoạch phim (planner LF) ────────────────────────────────────────
  const buildPlan = async (): Promise<void> => {
    if (clipPaths.length === 0) {
      setError('Chưa có clip nào có đường dẫn đầy đủ — hãy quét thư mục gốc trước.');
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
      const r = await wsClient.call<{ edit_plan: EditPlan }>('context.buildEditPlan', {
        clipPaths,
        goal: tpl.goal,
        targetDurationSec: tpl.longform?.targetDurationSec,
        keepRatio: tpl.longform?.keepRatio,
        pacingProfile: tpl.longform?.pacingProfile,
        structure: tpl.longform?.structure,
      });
      setPlan(r.edit_plan);
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
      setError('Chưa có clip có đường dẫn — hãy quét thư mục gốc trước.');
      return;
    }
    setBusy('deadair');
    setError(null);
    try {
      const r = await wsClient.call<{
        edit_plan: EditPlan;
        total_trims: number;
        total_disables: number;
        estimated_saved_sec: number;
      }>('context.planDeadAir', { clipPaths });
      setPlan(r.edit_plan);
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

  // ── Xem trước / Ghi ───────────────────────────────────────────────────────
  const apply = async (write: boolean): Promise<void> => {
    if (!plan) return;
    setBusy(write ? 'apply' : 'preview');
    setError(null);
    try {
      const res = await wsClient.call<ApplyResponse>('safe.applyPlan', {
        editPlan: plan,
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

  const fmt = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m ? `${m} phút ${sec} giây` : `${sec} giây`;
  };

  return (
    <div className="film-tab">
      <div className="film-intro">
        <h2>🎬 Dựng phim Nerf dài</h2>
        <p className="film-sub">
          Nạp clip → chọn kiểu phim → lập kế hoạch theo chương → cắt khoảng chết → duyệt → ghi. An
          toàn, hoàn tác được.
        </p>
      </div>

      <ErrorBox error={error} />

      {/* 1. Nguồn clip */}
      <Section title="1. Nguồn clip" icon="🎞️">
        <div className="film-row">
          <Button onClick={() => void loadFromSequence()} busy={busy === 'load'}>
            🔄 Nạp lại từ sequence
          </Button>
          {seqName && (
            <Badge tone="accent" title="Sequence đang mở">
              {seqName} · {clips.length} clip
            </Badge>
          )}
          {clips.length > 0 && (
            <Badge tone={clipPaths.length ? 'success' : 'warn'}>
              {clipPaths.length}/{clips.length} có path
            </Badge>
          )}
        </div>

        <div className="film-folder">
          <textarea
            className="film-folderbox"
            placeholder="Dán thư mục gốc (mỗi dòng 1 folder: video/nhạc/hiệu ứng) rồi Quét để lấy path đầy đủ…"
            value={folderText}
            onChange={(e) => setFolderText(e.target.value)}
            rows={2}
          />
          <Button onClick={() => void scanFolders()} busy={busy === 'scan'}>
            🔍 Quét thư mục → map path
          </Button>
        </div>

        {clips.length > 0 ? (
          <ClipTable clips={clips} />
        ) : (
          <EmptyState
            icon="📭"
            title="Chưa có clip"
            hint="Mở 1 sequence trong Premiere rồi bấm Nạp lại."
          />
        )}
      </Section>

      {/* 2. Kiểu phim */}
      <Section title="2. Kiểu phim" icon="🎭">
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
      </Section>

      {/* 3. Lập kế hoạch */}
      <Section title="3. Lập kế hoạch" icon="🧠">
        <div className="film-row">
          <Button
            variant="primary"
            onClick={() => void buildPlan()}
            busy={busy === 'plan'}
            disabled={!clipPaths.length}
          >
            🎬 Lập kế hoạch phim
          </Button>
          <Button
            onClick={() => void planDeadAir()}
            busy={busy === 'deadair'}
            disabled={!clipPaths.length}
          >
            ✂️ Cắt khoảng chết (dead-air)
          </Button>
        </div>

        {deadAir && (
          <div className="film-deadair">
            ✂️ Cắt dead-air: tỉa <b>{deadAir.trims}</b> clip · ẩn <b>{deadAir.disables}</b> clip ·
            bỏ ~<b>{fmt(deadAir.saved)}</b> thời lượng chết.
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
              {plan.steps.length} bước
              {plan.estimated_kept_clips ? ` · giữ ~${plan.estimated_kept_clips} clip` : ''}
            </div>
          </div>
        )}
      </Section>

      {/* 4. Duyệt & Ghi */}
      {plan && (
        <Section title="4. Duyệt & Ghi" icon="✅">
          <div className="film-row">
            <Button onClick={() => void apply(false)} busy={busy === 'preview'}>
              👀 Xem trước
            </Button>
            <Button variant="primary" onClick={() => void apply(true)} busy={busy === 'apply'}>
              ✍️ Duyệt & Ghi
            </Button>
          </div>
          {applyRes && (
            <div className="film-result">
              {applyRes.dryRun ? '🔵 Xem trước' : '🟢 Đã ghi'}: {applyRes.applied} áp dụng ·{' '}
              {applyRes.failed} lỗi · {applyRes.deferred} hoãn / {applyRes.total} bước.
              {applyRes.approvalNote && <div className="film-note">{applyRes.approvalNote}</div>}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

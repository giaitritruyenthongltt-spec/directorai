/**
 * Sprint H.2-fix — Composite Director tools.
 *
 * The LLM's Director prompt promises a few high-level operations (analyze
 * all clips for quality, cut on the music beat, etc.) that aren't single
 * adapter calls — they compose primitives + sidecar HTTP. This module
 * exposes those composites as RPC tools so the PlanExecutor can call
 * them like any other tool.
 *
 *   context.scoreQuality   → POST sidecar /vision/analyze_clip per clip
 *   context.detectBeats    → POST sidecar /beats for the music file
 *   timeline.cutOnBeats    → fetch beats + iterate adapter.cutClip
 *   context.scanClips      → listClips + persist metadata to SQLite
 */

import { promises as fs, type Dirent } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Logger } from '@directorai/shared';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import type { Clip } from '@directorai/core';
import { EFFECT_PRESETS, pickColorPresetForMood } from '@directorai/effect-library';
import { listModuleInfos } from '@directorai/modules';
import { buildFcpxml, type FcpTimeline } from '@directorai/fcpxml';
import { resolvePlan, type PlanPreview } from './plan-resolver.js';
import { applyResolvedPlan, type ApplyResult } from './plan-executor.js';
import type { CheckpointStore } from './checkpoint-store.js';

const SIDECAR_URL = process.env.CONTEXT_ENGINE_URL ?? 'http://127.0.0.1:8000';

interface SidecarAnalyzeClip {
  path: string;
  duration_sec: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  sample_count: number;
  elapsed_ms: number;
  quality: {
    blur: number;
    exposure: number;
    focus: number;
    framing: number;
    composite: number;
  };
}

interface SidecarBeats {
  tempo_bpm: number;
  beats_sec: number[];
}

/** Thao tác đã verify ghi được trên Premiere 26 (Track A). Kế hoạch edit
 *  (AI-3) chỉ được chứa các action này — guard phía server ép buộc. */
export const SAFE_PLAN_ACTIONS = ['disable', 'trim', 'move', 'rename', 'transition'] as const;
export type SafePlanAction = (typeof SAFE_PLAN_ACTIONS)[number];

export interface EditPlanStep {
  order: number;
  action: SafePlanAction;
  target_path: string;
  params: Record<string, unknown>;
  reason: string;
  reversible: boolean;
}

export interface EditPlanOutOfScope {
  want: string;
  needs: string;
  why: string;
}

/** LF3 — Lớp tự sự: một CHƯƠNG của phim dài (mô tả, không thực thi). */
export interface EditPlanChapter {
  name: string;
  purpose: string;
  pacing: string;
  target_duration_sec: number;
  clip_paths: string[];
}

/** LF1 — Tham số định hướng phim dài cho planner (tất cả optional). */
export interface LongformOptions {
  targetDurationSec?: number;
  keepRatio?: number;
  pacingProfile?: string;
  structure?: 'three_act' | '3act' | 'chapters' | 'recap';
}

export interface EditPlan {
  goal_understanding: string;
  strategy: string;
  steps: EditPlanStep[];
  out_of_scope: EditPlanOutOfScope[];
  /** LF3 — chương tự sự (phim dài); rỗng cho short-form. */
  chapters?: EditPlanChapter[];
  total_target_duration_sec?: number;
  estimated_kept_clips?: number;
  estimated_impact: string;
  requires_preview: boolean;
  rejected_unsafe_steps?: number;
  confidence: number;
}

export interface EditPlanResult {
  edit_plan: EditPlan;
  video_map: unknown;
  clips_understood: number;
  clips_failed: number;
  errors: { clip_path: string; error: string }[];
}

async function sidecarPost<T>(path: string, payload: object): Promise<T> {
  const res = await fetch(`${SIDECAR_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`sidecar ${path} HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export interface CompositeToolDeps {
  readonly adapter: IPremiereAdapter;
  readonly logger: Logger;
  /** SAFE-2 — kho checkpoint (P4.06). Nếu có, applyPlan tự snapshot trước
   *  khi ghi thật để hoàn tác/khôi phục. */
  readonly checkpoints?: CheckpointStore;
}

export class CompositeTools {
  constructor(private readonly deps: CompositeToolDeps) {}

  /** Dispatch entry point — accepts the same `method, params` shape as the
   *  primitive RPC dispatcher. Returns null when the method isn't a
   *  composite (caller falls back to the primitive dispatcher). */
  async maybeHandle(method: string, params: unknown): Promise<unknown | null> {
    switch (method) {
      case 'context.scanClips':
        return this.scanClips(params as { sequenceId?: string });
      case 'context.scoreQuality':
        return this.scoreQuality(params as { sequenceId?: string; clipId?: string });
      case 'context.detectBeats':
        return this.detectBeats(params as { audioPath: string });
      case 'context.detectSilences':
        return this.detectSilences(params as { audioPath: string });
      case 'context.planDeadAir':
        return this.planDeadAir(
          params as {
            clipPaths: string[];
            minSilenceSec?: number;
            keepPaddingSec?: number;
            thresholdDb?: number;
          }
        );
      case 'context.listEffects':
        return this.listEffects(params as { category?: string });
      case 'context.analyzeColor':
        return this.analyzeColor(params as { clipPath: string });
      case 'context.classifyScene':
        return this.classifyScene(params as { clipPath: string });
      case 'context.understandClip':
        return this.understandClip(params as { clipPath: string; frames?: number });
      case 'context.buildVideoMap':
        return this.buildVideoMap(
          params as { clipPaths: string[]; goal?: string; frames?: number }
        );
      case 'context.filterBad':
        return this.filterBad(
          params as { clipPaths: string[]; threshold?: number; frames?: number }
        );
      case 'context.clusterClips':
        return this.clusterClips(params as { clipPaths: string[]; maxDistance?: number });
      case 'context.qualityReport':
        return this.qualityReport(params as { clipPaths: string[]; threshold?: number });
      case 'context.buildEditPlan':
        return this.buildEditPlan(
          params as { clipPaths: string[]; goal: string; frames?: number } & LongformOptions
        );
      case 'module.list':
        return { modules: listModuleInfos() };
      case 'context.activeSequenceClips':
        return this.activeSequenceClips(params as { sequenceId?: string });
      case 'context.resolveFromFolders':
        return this.resolveFromFolders(params as { folders: string[]; sequenceId?: string });
      case 'fcpxml.export':
        return this.exportFcpxml(params as { timeline: FcpTimeline; fileName?: string });
      case 'safe.previewPlan':
        return this.previewPlan(
          params as {
            sequenceId?: string;
            editPlan?: EditPlan;
            clipPaths?: string[];
            goal?: string;
            frames?: number;
          } & LongformOptions
        );
      case 'safe.applyPlan':
        return this.applyPlan(
          params as {
            sequenceId?: string;
            editPlan?: EditPlan;
            clipPaths?: string[];
            goal?: string;
            frames?: number;
            dryRun?: boolean;
            approved?: boolean;
            reportOnly?: boolean;
          } & LongformOptions
        );
      case 'timeline.cutOnBeats':
        return this.cutOnBeats(params as { sequenceId: string; beats: number[]; clipId?: string });
      case 'color.applyLookByScene':
        return this.applyLookByScene(
          params as { sequenceId?: string; defaultPreset?: string; sampleCount?: number }
        );
      default:
        return null;
    }
  }

  listMethods(): readonly string[] {
    return [
      'context.scanClips',
      'context.scoreQuality',
      'context.detectBeats',
      'context.detectSilences',
      'context.planDeadAir',
      'context.listEffects',
      'context.analyzeColor',
      'context.classifyScene',
      'context.understandClip',
      'context.buildVideoMap',
      'context.buildEditPlan',
      'context.filterBad',
      'context.clusterClips',
      'context.qualityReport',
      'context.activeSequenceClips',
      'context.resolveFromFolders',
      'module.list',
      'fcpxml.export',
      'safe.previewPlan',
      'safe.applyPlan',
      'timeline.cutOnBeats',
      'color.applyLookByScene',
    ];
  }

  // ─── context.understandClip (AI-1 — Vision) ───────────────────────────

  /**
   * AI-1 — Hiểu ngữ nghĩa 1 clip bằng Gemini Vision (Tầng 2). Trả về
   * understanding có quality_verdict + lý do (phân biệt blur-action vs
   * blur-lỗi) thay vì chỉ con số.
   */
  async understandClip(params: { clipPath: string; frames?: number }): Promise<{
    media_path: string;
    summary: string;
    scene_type: string;
    action_level: number;
    is_key_moment: boolean;
    key_moment_type: string | null;
    subjects: string[];
    blur_assessment: string;
    quality_verdict: 'keep' | 'review' | 'discard';
    quality_reason: string;
    emotion: string;
    confidence: number;
    frames_used: number;
  }> {
    if (!params.clipPath) throw new Error('clipPath required');
    const interval = params.frames ? 1.0 / params.frames : 0.33;
    return sidecarPost('/vision/understand_clip', {
      media_path: params.clipPath,
      sample_interval_sec: interval,
    });
  }

  // ─── context.activeSequenceClips (auto-connect: tự lấy clip) ──────────

  /**
   * Auto-connect — Plugin TỰ lấy clip từ sequence ĐANG MỞ (không nhập tay).
   * Trả clip kèm path tốt nhất lấy được + cờ hasFullPath (path tuyệt đối,
   * đọc được bởi sidecar AI) hay chỉ basename. UI dùng để nạp sẵn box file.
   */
  async activeSequenceClips(params: { sequenceId?: string }): Promise<{
    sequenceId: string;
    sequenceName: string;
    clips: { id: string; name: string; path: string; hasFullPath: boolean; kind: string }[];
    total: number;
    withFullPath: number;
  }> {
    let sequenceId = params.sequenceId;
    let sequenceName = '';
    if (!sequenceId) {
      const seq = await this.deps.adapter.getActiveSequence();
      if (!seq) throw new Error('Không có sequence đang mở trong Premiere');
      sequenceId = seq.id;
      sequenceName = seq.name;
    }
    const clips = await this.deps.adapter.listClips(sequenceId);
    const hasSep = (p?: string): boolean => !!p && /[\\/]/.test(p);
    const out = clips.map((c) => {
      const path = c.source?.path ?? '';
      return {
        id: c.id,
        name: c.name,
        path,
        hasFullPath: hasSep(path),
        kind: c.kind,
      };
    });
    return {
      sequenceId,
      sequenceName,
      clips: out,
      total: out.length,
      withFullPath: out.filter((c) => c.hasFullPath).length,
    };
  }

  // ─── context.resolveFromFolders (D4 — map tên clip → path đầy đủ) ─────

  /**
   * D4 — Premiere 26 chỉ cho plugin biết TÊN clip, không cho đường dẫn đầy
   * đủ. Người dùng chỉ định các THƯ MỤC gốc (video/music/fx ở nhiều folder)
   * 1 lần → server quét đệ quy, map basename → path tuyệt đối cho clip của
   * sequence đang mở. Nhờ vậy AI đọc được file mà KHÔNG cần nhập từng path.
   */
  async resolveFromFolders(params: { folders: string[]; sequenceId?: string }): Promise<{
    resolved: { name: string; fullPath: string }[];
    unresolved: string[];
    foldersScanned: number;
    filesIndexed: number;
  }> {
    if (!params.folders?.length) throw new Error('folders required (non-empty)');
    // Index mọi file trong các thư mục (đệ quy, giới hạn để khỏi treo).
    const index = new Map<string, string>(); // basename(lower) → fullpath
    let filesIndexed = 0;
    const MAX_FILES = 200_000;
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 8 || filesIndexed >= MAX_FILES) return;
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // thư mục không đọc được → bỏ qua
      }
      for (const e of entries) {
        if (filesIndexed >= MAX_FILES) return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full, depth + 1);
        } else if (e.isFile()) {
          const key = e.name.toLowerCase();
          if (!index.has(key)) index.set(key, full); // ưu tiên file gặp trước
          filesIndexed++;
        }
      }
    };
    for (const f of params.folders) await walk(f, 0);

    // Lấy clip của sequence đang mở.
    const seqClips = await this.activeSequenceClips({ sequenceId: params.sequenceId });
    const resolved: { name: string; fullPath: string }[] = [];
    const unresolved: string[] = [];
    const seenName = new Set<string>();
    for (const c of seqClips.clips) {
      const base = (c.name.split(/[\\/]/).pop() ?? c.name).toLowerCase();
      if (seenName.has(base)) continue; // tránh trùng (1 file dùng nhiều lần)
      seenName.add(base);
      const hit = index.get(base);
      if (hit) resolved.push({ name: c.name, fullPath: hit });
      else unresolved.push(c.name);
    }
    this.deps.logger.info(
      { foldersScanned: params.folders.length, filesIndexed, resolved: resolved.length },
      'context.resolveFromFolders'
    );
    return { resolved, unresolved, foldersScanned: params.folders.length, filesIndexed };
  }

  // ─── context.filterBad (MOD-3 — CV prefilter → Vision subset) ─────────

  /**
   * MOD-3 — Lọc clip kém tiết kiệm: CV thô chấm HẾT clip, chỉ clip nghi
   * ngờ kém mới đẩy lên Vision (Gemini) phân xử keep/review/discard. Trả
   * thống kê chi phí (cv_scanned vs vision_calls) để minh bạch.
   */
  async filterBad(params: { clipPaths: string[]; threshold?: number; frames?: number }): Promise<{
    keep: { clip_path: string; reason: string; by: string }[];
    review: { clip_path: string; reason: string; by: string }[];
    discard: { clip_path: string; reason: string; by: string }[];
    cv_scanned: number;
    suspects: number;
    vision_calls: number;
    prefilter: unknown[];
  }> {
    if (!params.clipPaths?.length) throw new Error('clipPaths required (non-empty)');
    const interval = params.frames ? 1.0 / params.frames : 0.33;
    return sidecarPost('/vision/filter_bad', {
      clip_paths: params.clipPaths,
      threshold: params.threshold ?? 0.5,
      sample_interval_sec: interval,
    });
  }

  // ─── context.clusterClips (COST-1 — gom clip gần giống) ───────────────

  /**
   * COST-1 — Gom clip gần giống bằng perceptual hash → chỉ cần hiểu 1 đại
   * diện/cụm bằng Vision, suy ra cả cụm. Giảm số lần gọi Gemini.
   */
  async clusterClips(params: { clipPaths: string[]; maxDistance?: number }): Promise<{
    clusters: { representative: string; members: string[] }[];
    n_clips: number;
    n_clusters: number;
    reduction: number;
  }> {
    if (!params.clipPaths?.length) throw new Error('clipPaths required (non-empty)');
    return sidecarPost('/vision/cluster_clips', {
      clip_paths: params.clipPaths,
      max_distance: params.maxDistance ?? 6,
    });
  }

  // ─── fcpxml.export (B10 — Tầng 4: dựng-từ-đầu/split/speed/marker) ─────

  /**
   * B10 — Sinh FCPXML từ timeline (clip + in/out + speed + marker) và ghi
   * ra ~/.directorai/exports/. Cho phép những thao tác Premiere 26 UXP KHÔNG
   * ghi được; người dùng Import file này vào Premiere.
   */
  async exportFcpxml(params: {
    timeline: FcpTimeline;
    fileName?: string;
  }): Promise<{ path: string; bytes: number; clips: number }> {
    const tl = params.timeline;
    if (!tl?.clips?.length) throw new Error('timeline.clips rỗng');
    const xml = buildFcpxml(tl);
    const dir = path.join(os.homedir(), '.directorai', 'exports');
    await fs.mkdir(dir, { recursive: true });
    const safe = (params.fileName ?? tl.name ?? 'sequence')
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const file = path.join(dir, `${safe || 'sequence'}.fcpxml`);
    await fs.writeFile(file, xml, 'utf-8');
    this.deps.logger.info({ path: file, clips: tl.clips.length }, 'fcpxml.export written');
    return { path: file, bytes: Buffer.byteLength(xml, 'utf-8'), clips: tl.clips.length };
  }

  // ─── context.qualityReport (MOD-5 — báo cáo chất lượng) ───────────────

  /**
   * MOD-5 — Báo cáo chất lượng (read-only): gộp CV prefilter + cụm hoá →
   * bảng từng clip (composite/blur/suspect) + tóm tắt + xuất CSV/HTML ra
   * ~/.directorai/reports/. KHÔNG ghi gì lên timeline. Rẻ — không gọi Gemini.
   */
  async qualityReport(params: { clipPaths: string[]; threshold?: number }): Promise<{
    rows: {
      clip_path: string;
      composite: number;
      blur: number;
      suspect_score: number;
      is_suspect: boolean;
    }[];
    summary: { total: number; suspects: number; clusters: number; reduction: number };
    csvPath: string;
    htmlPath: string;
  }> {
    if (!params.clipPaths?.length) throw new Error('clipPaths required (non-empty)');
    const threshold = params.threshold ?? 0.5;
    // CV prefilter (rẻ) — không gọi Gemini.
    const pf = await sidecarPost<{
      prefilter: {
        clip_path: string;
        composite: number;
        blur: number;
        suspect_score: number;
        is_suspect: boolean;
      }[];
      suspects: number;
    }>('/vision/filter_bad', {
      clip_paths: params.clipPaths,
      threshold,
      sample_interval_sec: 0.33,
    });
    const cl = await this.clusterClips({ clipPaths: params.clipPaths });
    const rows = pf.prefilter ?? [];
    const summary = {
      total: params.clipPaths.length,
      suspects: pf.suspects ?? rows.filter((r) => r.is_suspect).length,
      clusters: cl.n_clusters,
      reduction: cl.reduction,
    };
    const { csvPath, htmlPath } = await this.writeQualityReportFiles(rows, summary);
    return { rows, summary, csvPath, htmlPath };
  }

  /** MOD-5 — Ghi báo cáo chất lượng CSV + HTML ra ~/.directorai/reports/. */
  private async writeQualityReportFiles(
    rows: {
      clip_path: string;
      composite: number;
      blur: number;
      suspect_score: number;
      is_suspect: boolean;
    }[],
    summary: { total: number; suspects: number; clusters: number; reduction: number }
  ): Promise<{ csvPath: string; htmlPath: string }> {
    const dir = path.join(os.homedir(), '.directorai', 'reports');
    await fs.mkdir(dir, { recursive: true });
    const csv = [
      'clip,composite,blur,suspect_score,is_suspect',
      ...rows.map(
        (r) =>
          `"${r.clip_path}",${r.composite},${r.blur},${r.suspect_score},${r.is_suspect ? 1 : 0}`
      ),
    ].join('\n');
    const csvPath = path.join(dir, 'quality-report.csv');
    await fs.writeFile(csvPath, csv, 'utf-8');

    const htmlRows = rows
      .map(
        (r) =>
          `<tr class="${r.is_suspect ? 'bad' : 'ok'}"><td>${r.clip_path}</td><td>${r.composite}</td><td>${r.blur}</td><td>${r.suspect_score}</td><td>${r.is_suspect ? '⚠ nghi' : '✓ tốt'}</td></tr>`
      )
      .join('\n');
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Báo cáo chất lượng — DirectorAI</title>
<style>body{font-family:system-ui;margin:24px;color:#222}h1{font-size:18px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 8px;font-size:13px}
th{background:#f3f3f3;text-align:left}tr.bad{background:#fff2f2}tr.ok td:last-child{color:#3a3}
.sum{margin:8px 0 16px;color:#555}</style></head><body>
<h1>📊 Báo cáo chất lượng clip (DirectorAI)</h1>
<div class="sum">Tổng ${summary.total} clip · nghi kém ${summary.suspects} · cụm ${summary.clusters} (giảm ${Math.round(summary.reduction * 100)}% gọi Vision)</div>
<table><thead><tr><th>Clip</th><th>Composite</th><th>Blur</th><th>Nghi-ngờ</th><th>Đánh giá</th></tr></thead>
<tbody>${htmlRows}</tbody></table></body></html>`;
    const htmlPath = path.join(dir, 'quality-report.html');
    await fs.writeFile(htmlPath, html, 'utf-8');
    this.deps.logger.info({ csvPath, htmlPath, rows: rows.length }, 'qualityReport written');
    return { csvPath, htmlPath };
  }

  // ─── context.buildVideoMap (AI-2 — Tầng 3) ────────────────────────────

  /**
   * AI-2 — Gộp nhiều clip thành "bản đồ video" tổng: cốt truyện, phân
   * đoạn, khoảnh khắc đắt giá, clip trùng, thứ tự lắp ráp gợi ý. Mỗi clip
   * được hiểu qua AI-1 (có cache) rồi gộp bằng Gemini text. Read-only —
   * chỉ ĐỀ XUẤT, không sửa timeline.
   */
  async buildVideoMap(params: { clipPaths: string[]; goal?: string; frames?: number }): Promise<{
    video_map: {
      title_suggestion: string;
      overall_summary: string;
      story_arc: string;
      segments: {
        name: string;
        purpose: string;
        clip_paths: string[];
        description: string;
      }[];
      key_moments: {
        clip_path: string;
        type: string;
        why: string;
        suggested_emphasis: string;
      }[];
      duplicates: { clip_paths: string[]; reason: string; keep_suggestion: string }[];
      discard_candidates: string[];
      assembly_suggestion: string[];
      quality_summary: { keep: number; review: number; discard: number };
      editorial_notes: string;
      total_clips: number;
      confidence: number;
    };
    understandings: unknown[];
    errors: { clip_path: string; error: string }[];
    clips_understood: number;
    clips_failed: number;
  }> {
    if (!params.clipPaths?.length) throw new Error('clipPaths required (non-empty)');
    const interval = params.frames ? 1.0 / params.frames : 0.33;
    return sidecarPost('/vision/build_video_map', {
      clip_paths: params.clipPaths,
      goal: params.goal,
      sample_interval_sec: interval,
    });
  }

  // ─── context.buildEditPlan (AI-3 — Tầng 4) ────────────────────────────

  /**
   * AI-3 — Lập kế hoạch edit có lý do từ clip + mục tiêu. Pipeline đầy đủ:
   * hiểu clip (cache) → bản đồ video → kế hoạch. Kế hoạch CHỈ chứa thao
   * tác đã verify ghi được; double-guard phía server loại mọi bước lọt
   * lưới dùng op chưa ghi được. KHÔNG tự chạy — đi vào Tầng an toàn.
   */
  async buildEditPlan(
    params: {
      clipPaths: string[];
      goal: string;
      frames?: number;
    } & LongformOptions
  ): Promise<EditPlanResult> {
    if (!params.clipPaths?.length) throw new Error('clipPaths required (non-empty)');
    if (!params.goal?.trim()) throw new Error('goal required');
    const interval = params.frames ? 1.0 / params.frames : 0.33;
    // LF1 — chuẩn hóa structure về tên sidecar mong đợi ("3act").
    const structure = params.structure === 'three_act' ? '3act' : (params.structure ?? undefined);
    const res = await sidecarPost<EditPlanResult>('/vision/build_edit_plan', {
      clip_paths: params.clipPaths,
      goal: params.goal,
      sample_interval_sec: interval,
      target_duration_sec: params.targetDurationSec,
      keep_ratio: params.keepRatio,
      pacing_profile: params.pacingProfile,
      structure,
    });
    return this.guardEditPlan(res);
  }

  /**
   * Double-guard: loại mọi step dùng thao tác CHƯA verify ghi được
   * (split/speed/insert/marker…), kể cả khi sidecar bỏ sót. Step bị loại
   * chuyển sang out_of_scope. Đây là lằn ranh an toàn cuối cùng trước khi
   * kế hoạch chạm tới timeline.
   */
  private guardEditPlan(res: EditPlanResult): EditPlanResult {
    const plan = res?.edit_plan;
    if (!plan || !Array.isArray(plan.steps)) return res;
    const kept: EditPlanStep[] = [];
    let rejected = 0;
    for (const s of plan.steps) {
      const action = String(s?.action ?? '').toLowerCase();
      if ((SAFE_PLAN_ACTIONS as readonly string[]).includes(action)) {
        kept.push({ ...s, action: action as EditPlanStep['action'], reversible: true });
      } else {
        rejected += 1;
        plan.out_of_scope = plan.out_of_scope ?? [];
        plan.out_of_scope.push({
          want: `${s?.action} trên ${s?.target_path ?? '?'}`,
          needs: 'FCPXML (Premiere 26 chưa cho plugin ghi)',
          why: s?.reason ?? '',
        });
        this.deps.logger.warn(
          { action: s?.action, target: s?.target_path },
          'editPlan.guard rejected unsafe step'
        );
      }
    }
    plan.steps = kept;
    plan.requires_preview = true;
    plan.rejected_unsafe_steps = (plan.rejected_unsafe_steps ?? 0) + rejected;
    return res;
  }

  // ─── safe.previewPlan (SAFE-1a — Tầng an toàn, CHỈ ĐỌC) ────────────────

  /**
   * SAFE-1a — Xem trước kế hoạch trên timeline THẬT mà KHÔNG ghi gì. Khớp
   * media_path → clipId thật, mô tả từng bước người-đọc-được, đánh dấu bước
   * nào tìm được clip / ghi được. Đây là cổng bắt buộc trước khi áp dụng.
   *
   * Nhận sẵn `editPlan`, hoặc tự dựng từ `clipPaths + goal`.
   */
  async previewPlan(
    params: {
      sequenceId?: string;
      editPlan?: EditPlan;
      clipPaths?: string[];
      goal?: string;
      frames?: number;
    } & LongformOptions
  ): Promise<PlanPreview & { plan: EditPlan }> {
    // 1) Lấy kế hoạch (qua guard an toàn).
    let plan = params.editPlan;
    if (!plan) {
      if (!params.clipPaths?.length || !params.goal?.trim()) {
        throw new Error('previewPlan: cần editPlan, hoặc (clipPaths + goal)');
      }
      const built = await this.buildEditPlan({
        clipPaths: params.clipPaths,
        goal: params.goal,
        frames: params.frames,
        targetDurationSec: params.targetDurationSec,
        keepRatio: params.keepRatio,
        pacingProfile: params.pacingProfile,
        structure: params.structure,
      });
      plan = built.edit_plan;
    } else {
      // editPlan truyền vào cũng phải qua guard.
      plan = this.guardEditPlan({
        edit_plan: plan,
        video_map: null,
        clips_understood: 0,
        clips_failed: 0,
        errors: [],
      }).edit_plan;
    }

    // 2) Xác định sequence + lấy clip thật.
    let sequenceId = params.sequenceId;
    if (!sequenceId) {
      const seq = await this.deps.adapter.getActiveSequence();
      if (!seq) throw new Error('previewPlan: không có sequence đang mở');
      sequenceId = seq.id;
    }
    const clips = await this.deps.adapter.listClips(sequenceId);

    // 3) Khớp + sinh preview (thuần, không ghi).
    const preview = resolvePlan(plan, clips, sequenceId);
    this.deps.logger.info(
      {
        sequenceId,
        total: preview.totalSteps,
        resolved: preview.resolvedCount,
        executable: preview.executableCount,
      },
      'safe.previewPlan resolved'
    );
    return { ...preview, plan };
  }

  // ─── safe.applyPlan (SAFE-1c — GHI THẬT có kiểm soát) ──────────────────

  /**
   * SAFE-1c/SAFE-2 — Áp dụng kế hoạch lên timeline thật, có cổng duyệt +
   * checkpoint tự động + chế độ báo-cáo.
   *
   * Quy trình: preview (SAFE-1a) → CỔNG DUYỆT (ghi thật cần approved=true)
   * → CHECKPOINT tự động (SAFE-2, trước khi ghi) → executor ghi qua Track A.
   *
   * - `dryRun: true` → mô phỏng, KHÔNG ghi (mặc định khi chưa duyệt).
   * - `reportOnly: true` → ép dry-run + xuất kế hoạch ra file báo cáo.
   * - Ghi thật cần `approved: true`; nếu không sẽ tự hạ dry-run + báo.
   */
  async applyPlan(
    params: {
      sequenceId?: string;
      editPlan?: EditPlan;
      clipPaths?: string[];
      goal?: string;
      frames?: number;
      dryRun?: boolean;
      approved?: boolean;
      reportOnly?: boolean;
    } & LongformOptions
  ): Promise<
    ApplyResult & {
      plan: EditPlan;
      requiredApproval: boolean;
      approvalNote?: string;
      checkpointId?: string;
      reportPath?: string;
    }
  > {
    const preview = await this.previewPlan({
      sequenceId: params.sequenceId,
      editPlan: params.editPlan,
      clipPaths: params.clipPaths,
      goal: params.goal,
      frames: params.frames,
      targetDurationSec: params.targetDurationSec,
      keepRatio: params.keepRatio,
      pacingProfile: params.pacingProfile,
      structure: params.structure,
    });

    // CỔNG DUYỆT: ghi thật chỉ khi dryRun=false, approved=true, KHÔNG reportOnly.
    const wantWrite = params.dryRun === false && params.reportOnly !== true;
    const approved = params.approved === true;
    const effectiveDryRun = !(wantWrite && approved);
    const approvalNote =
      wantWrite && !approved
        ? 'Cần approved=true để ghi thật — đã tự hạ về dry-run để bạn xem trước.'
        : undefined;

    // SAFE-2 — CHECKPOINT tự động NGAY TRƯỚC khi ghi thật.
    // LƯU Ý: checkpoint chỉ lưu metadata sequence (audit + crash-recovery
    // panel), KHÔNG tự khôi phục timeline — hoàn tác thật là Ctrl-Z trong
    // Premiere (mỗi bước = 1 undo step).
    let checkpointId: string | undefined;
    if (!effectiveDryRun && !this.deps.checkpoints) {
      // Ghi thật mà KHÔNG có kho checkpoint → cảnh báo rõ (không ghi lén).
      this.deps.logger.warn(
        { sequenceId: preview.sequenceId },
        'safe.applyPlan GHI THẬT mà KHÔNG có checkpoint store — chỉ dựa vào Undo'
      );
    }
    if (!effectiveDryRun && this.deps.checkpoints) {
      try {
        const cp = await this.deps.checkpoints.snapshot(
          this.deps.adapter,
          `safe.applyPlan ${preview.plan.goal_understanding?.slice(0, 40) ?? ''}`.trim()
        );
        checkpointId = cp.id;
        this.deps.logger.info({ checkpointId, label: cp.label }, 'safe.applyPlan checkpoint taken');
      } catch (e) {
        // Không ghi nếu checkpoint thất bại — an toàn là trên hết.
        const msg = e instanceof Error ? e.message : String(e);
        this.deps.logger.warn({ err: msg }, 'safe.applyPlan checkpoint failed — abort write');
        throw new Error(`Không tạo được checkpoint trước khi ghi → huỷ để an toàn: ${msg}`, {
          cause: e,
        });
      }
    }

    const result = await applyResolvedPlan(this.deps.adapter, preview, {
      dryRun: effectiveDryRun,
      logger: this.deps.logger,
    });

    // SAFE-2 — Chế độ báo-cáo: xuất kế hoạch + preview ra file.
    let reportPath: string | undefined;
    if (params.reportOnly === true) {
      reportPath = await this.writePlanReport(preview, result);
    }

    this.deps.logger.info(
      {
        sequenceId: result.sequenceId,
        dryRun: result.dryRun,
        applied: result.applied,
        failed: result.failed,
        deferred: result.deferred,
        skipped: result.skipped,
        checkpointId,
        reportPath,
      },
      'safe.applyPlan done'
    );

    return {
      ...result,
      plan: preview.plan,
      requiredApproval: wantWrite,
      approvalNote,
      checkpointId,
      reportPath,
    };
  }

  /** SAFE-2 — Ghi báo cáo kế hoạch (JSON) ra ~/.directorai/reports/. */
  private async writePlanReport(
    preview: PlanPreview & { plan: EditPlan },
    result: ApplyResult
  ): Promise<string> {
    const dir = path.join(os.homedir(), '.directorai', 'reports');
    await fs.mkdir(dir, { recursive: true });
    // Tên file ổn định theo nội dung (không dùng Date.now để dễ test/diff).
    const safe = (preview.plan.goal_understanding ?? 'plan')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .slice(0, 40)
      .replace(/^-+|-+$/g, '');
    const file = path.join(dir, `report-${safe || 'plan'}.json`);
    const report = {
      sequenceId: preview.sequenceId,
      goal_understanding: preview.plan.goal_understanding,
      strategy: preview.plan.strategy,
      counts: {
        total: result.total,
        applied: result.applied,
        deferred: result.deferred,
        skipped: result.skipped,
        failed: result.failed,
        dryRun: result.dryRunCount,
      },
      steps: result.results,
      out_of_scope: preview.plan.out_of_scope,
    };
    await fs.writeFile(file, JSON.stringify(report, null, 2), 'utf-8');
    this.deps.logger.info({ reportPath: file }, 'safe.applyPlan report written');
    return file;
  }

  // ─── context.classifyScene ────────────────────────────────────────────

  /**
   * F6 — Heuristic scene class + aesthetic-lite score for one clip.
   * Calls sidecar /scenes/classify. Returns the same shape as the
   * Python `SceneClassResult.to_dict()`.
   */
  async classifyScene(params: { clipPath: string }): Promise<{
    media_path: string;
    sample_count: number;
    motion_score: number;
    brightness: number;
    contrast: number;
    edge_density: number;
    aesthetic: number;
    scene_class: 'landscape' | 'closeup' | 'action' | 'dialog' | 'static' | 'lowlight';
  }> {
    if (!params.clipPath) throw new Error('clipPath required');
    return sidecarPost('/scenes/classify', {
      media_path: params.clipPath,
      sample_interval_sec: 0.15,
    });
  }

  // ─── context.listEffects ──────────────────────────────────────────────

  /**
   * P2-1 — List every effect/transition/color preset in the catalog so
   * the LLM can choose a valid `matchName` for `effect.apply` /
   * `transition.apply`. Optional `category` filter ('transition',
   * 'color', 'zoom', 'text'…).
   */
  listEffects(params: { category?: string }): {
    count: number;
    effects: {
      key: string;
      matchName: string;
      displayName: string;
      category: string;
      description: string;
    }[];
  } {
    const filtered = params.category
      ? EFFECT_PRESETS.filter((e) => e.category === params.category)
      : EFFECT_PRESETS;
    return {
      count: filtered.length,
      effects: filtered.map((e) => ({
        key: e.key,
        matchName: e.matchName,
        displayName: e.displayName,
        category: e.category,
        description: e.description,
      })),
    };
  }

  // ─── context.analyzeColor ─────────────────────────────────────────────

  /** Wrapper around sidecar /color/analyze — returns mood + warmth +
   *  dominant colors for the LLM to reason about per-clip looks. */
  async analyzeColor(params: { clipPath: string }): Promise<{
    media_path: string;
    sample_count: number;
    mood: 'warm' | 'cool' | 'neutral' | 'dark' | 'bright';
    brightness: number;
    saturation: number;
    contrast: number;
    warmth: number;
    dominants: { r: number; g: number; b: number; fraction: number }[];
  }> {
    if (!params.clipPath) throw new Error('clipPath required');
    return sidecarPost('/color/analyze', {
      media_path: params.clipPath,
      sample_interval_sec: 0.2,
    });
  }

  // ─── context.scanClips ────────────────────────────────────────────────

  /**
   * P1-1 — Read all clips and optionally rank by visual quality.
   *
   * If `rankByQuality: true` is passed, the sidecar /vision/analyze_clip
   * endpoint scores each clip's blur/exposure/focus/framing composite,
   * and the result is sorted desc by score. Otherwise just lists clips.
   * `topN` (default no limit) trims the result for rough-cut workflows.
   */
  async scanClips(params: {
    sequenceId?: string;
    rankByQuality?: boolean;
    topN?: number;
    sampleCount?: number;
  }): Promise<{
    count: number;
    ranked: boolean;
    clips: {
      id: string;
      name: string;
      path: string;
      durationSec: number;
      quality?: number;
    }[];
  }> {
    const seqId = params.sequenceId ?? (await this.deps.adapter.getActiveSequence())?.id;
    if (!seqId) throw new Error('No active sequence');
    const clips = await this.deps.adapter.listClips(seqId);

    interface Out {
      id: string;
      name: string;
      path: string;
      durationSec: number;
      quality?: number;
    }

    const summary: Out[] = clips.map((c) => ({
      id: c.id,
      name: c.name,
      path: c.source?.path ?? '',
      durationSec: c.timelineRange.end - c.timelineRange.start,
    }));

    if (!params.rankByQuality) {
      const out = typeof params.topN === 'number' ? summary.slice(0, params.topN) : summary;
      return { count: summary.length, ranked: false, clips: out };
    }

    const sampleCount = params.sampleCount ?? 5;
    let scored = 0;
    for (const c of summary) {
      if (!c.path) continue;
      try {
        const r = await sidecarPost<SidecarAnalyzeClip>('/vision/analyze_clip', {
          path: c.path,
          sample_count: sampleCount,
        });
        c.quality = r.quality.composite;
        scored++;
      } catch (e) {
        this.deps.logger.debug(
          { clipId: c.id, error: e instanceof Error ? e.message : String(e) },
          'scanClips score skip'
        );
      }
    }
    summary.sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1));
    this.deps.logger.info({ total: summary.length, scored }, 'context.scanClips ranked by quality');
    const out = typeof params.topN === 'number' ? summary.slice(0, params.topN) : summary;
    return { count: summary.length, ranked: true, clips: out };
  }

  // ─── context.scoreQuality ─────────────────────────────────────────────

  /** Score blur/exposure/focus/framing for either one clip (clipId) or
   *  every clip in a sequence (sequenceId). Calls the Python sidecar. */
  async scoreQuality(params: {
    sequenceId?: string;
    clipId?: string;
    sampleCount?: number;
  }): Promise<{
    scored: number;
    failed: number;
    results: {
      clipId: string;
      path: string;
      composite: number;
      blur: number;
      exposure: number;
      focus: number;
      framing: number;
    }[];
  }> {
    let clipsToScore: Clip[] = [];
    if (params.clipId) {
      const c = await this.deps.adapter.getClip(params.clipId);
      if (c) clipsToScore = [c];
    } else {
      const seqId = params.sequenceId ?? (await this.deps.adapter.getActiveSequence())?.id;
      if (!seqId) throw new Error('No active sequence');
      clipsToScore = [...(await this.deps.adapter.listClips(seqId))];
    }
    const sampleCount = params.sampleCount ?? 5;
    const results: Awaited<ReturnType<CompositeTools['scoreQuality']>>['results'] = [];
    let failed = 0;
    for (const clip of clipsToScore) {
      const path = clip.source?.path;
      if (!path) {
        failed++;
        continue;
      }
      try {
        const r = await sidecarPost<SidecarAnalyzeClip>('/vision/analyze_clip', {
          path,
          sample_count: sampleCount,
        });
        results.push({
          clipId: clip.id,
          path,
          composite: r.quality.composite,
          blur: r.quality.blur,
          exposure: r.quality.exposure,
          focus: r.quality.focus,
          framing: r.quality.framing,
        });
      } catch (e) {
        this.deps.logger.warn(
          { clipId: clip.id, error: e instanceof Error ? e.message : String(e) },
          'scoreQuality failed for clip'
        );
        failed++;
      }
    }
    this.deps.logger.info(
      { scored: results.length, failed, total: clipsToScore.length },
      'context.scoreQuality complete'
    );
    return { scored: results.length, failed, results };
  }

  // ─── context.detectBeats ──────────────────────────────────────────────

  async detectBeats(params: { audioPath: string }): Promise<SidecarBeats> {
    if (!params.audioPath) throw new Error('audioPath required');
    const r = await sidecarPost<{ tempo_bpm: number; beats_sec: number[] }>('/beats', {
      media_path: params.audioPath,
    });
    this.deps.logger.info(
      { tempo: r.tempo_bpm, beats: r.beats_sec.length },
      'context.detectBeats complete'
    );
    return r;
  }

  // ─── context.detectSilences ───────────────────────────────────────────

  async detectSilences(params: {
    audioPath: string;
  }): Promise<{ silences: { start: number; end: number }[] }> {
    if (!params.audioPath) throw new Error('audioPath required');
    // P1-2 — real /audio/silences endpoint now exists in the sidecar
    // (modules/silences.py), backed by audio_analyze.detect_silences.
    const r = await sidecarPost<{
      media_path: string;
      silences: { start: number; end: number }[];
    }>('/audio/silences', {
      media_path: params.audioPath,
    });
    this.deps.logger.info(
      { count: r.silences.length, media: r.media_path },
      'context.detectSilences complete'
    );
    return { silences: r.silences };
  }

  // ─── context.planDeadAir (LF4 — cắt dead-air → EditPlan) ──────────────

  /**
   * LF4 — Sinh kế hoạch cắt dead-air/khoảng lặng đầu-cuối từng clip. Trả về
   * một EditPlan (chỉ chứa trim/disable — safe ops) để cắm thẳng vào luồng
   * an toàn: `safe.previewPlan({editPlan})` → duyệt → `safe.applyPlan`.
   *
   * Đây là việc dựng phim dài hay làm nhất: bỏ "khoảng chết" (chờ/nạp đạn)
   * ở rìa clip mà KHÔNG cần người dùng nghe lại từng clip.
   */
  async planDeadAir(params: {
    clipPaths: string[];
    minSilenceSec?: number;
    keepPaddingSec?: number;
    thresholdDb?: number;
  }): Promise<
    EditPlanResult & {
      total_trims: number;
      total_disables: number;
      estimated_saved_sec: number;
    }
  > {
    if (!params.clipPaths?.length) throw new Error('clipPaths required (non-empty)');
    const r = await sidecarPost<{
      steps: EditPlanStep[];
      analyzed: number;
      errors: { clip_path: string; error: string }[];
      total_trims: number;
      total_disables: number;
      estimated_saved_sec: number;
    }>('/audio/dead_air', {
      clip_paths: params.clipPaths,
      min_silence_sec: params.minSilenceSec ?? 1.0,
      keep_padding_sec: params.keepPaddingSec ?? 0.25,
      threshold_db: params.thresholdDb ?? -40.0,
    });

    const mins = Math.floor(r.estimated_saved_sec / 60);
    const secs = Math.round(r.estimated_saved_sec % 60);
    const savedLabel = mins ? `${mins} phút ${secs} giây` : `${secs} giây`;
    const edit_plan: EditPlan = {
      goal_understanding: 'Cắt khoảng lặng/dead-air ở đầu-cuối từng clip.',
      strategy:
        `Phân tích ${r.analyzed} clip → tỉa ${r.total_trims} clip + ẩn ` +
        `${r.total_disables} clip im lặng. Ước tính bỏ ~${savedLabel} thời lượng chết.`,
      steps: r.steps,
      out_of_scope: [],
      estimated_impact: `Giảm ~${savedLabel} dead-air, giữ phần có tiếng/hành động.`,
      requires_preview: true,
      confidence: 0.7,
    };
    // Đi qua guard (steps đã chỉ là trim/disable — guard là lằn an toàn cuối).
    const guarded = this.guardEditPlan({
      edit_plan,
      video_map: null,
      clips_understood: r.analyzed,
      clips_failed: r.errors.length,
      errors: r.errors,
    });
    this.deps.logger.info(
      {
        analyzed: r.analyzed,
        trims: r.total_trims,
        disables: r.total_disables,
        savedSec: r.estimated_saved_sec,
      },
      'context.planDeadAir complete'
    );
    return {
      ...guarded,
      total_trims: r.total_trims,
      total_disables: r.total_disables,
      estimated_saved_sec: r.estimated_saved_sec,
    };
  }

  // ─── timeline.cutOnBeats ──────────────────────────────────────────────

  /**
   * P1-3 — Cut the sequence at each beat time.
   *
   * Without `clipId`, walks the V1 clip list and finds the clip whose
   * timeline range contains each beat (so a single 60s music track laid
   * across many video clips still cuts the *right* clip at every beat).
   * With `clipId`, scopes the cuts to that one clip.
   */
  async cutOnBeats(params: { sequenceId: string; beats: number[]; clipId?: string }): Promise<{
    cuts: number;
    skipped: number;
    details: { beatSec: number; clipId?: string; ok: boolean; reason?: string }[];
  }> {
    if (!params.beats?.length) throw new Error('beats array required');

    // Pre-load the sequence's clip list once when caller didn't pin a clip.
    let clipsOnSeq: Clip[] = [];
    if (!params.clipId) {
      clipsOnSeq = [...(await this.deps.adapter.listClips(params.sequenceId))]
        // Only video clips are relevant for visual cuts. Audio cuts go via
        // adapter.cutClip on the audio track when needed — out of scope here.
        .filter((c) => c.kind === 'video')
        .sort((a, b) => a.timelineRange.start - b.timelineRange.start);
    }

    let cuts = 0;
    let skipped = 0;
    const details: { beatSec: number; clipId?: string; ok: boolean; reason?: string }[] = [];

    for (const beatSec of params.beats) {
      // Locate the target clip: explicit override OR clip-under-beat.
      let targetClipId = params.clipId;
      let targetClip: Clip | undefined;
      if (!targetClipId) {
        targetClip = clipsOnSeq.find(
          (c) => c.timelineRange.start <= beatSec && beatSec < c.timelineRange.end
        );
        targetClipId = targetClip?.id;
      }
      if (!targetClipId) {
        skipped++;
        details.push({ beatSec, ok: false, reason: 'no clip at beat' });
        continue;
      }
      // Refuse cuts within 1 frame of either edge — Premiere rejects those
      // and they'd just thrash. 0.04s ≈ 1 frame @25fps, conservative.
      if (targetClip) {
        const eps = 0.04;
        if (
          beatSec <= targetClip.timelineRange.start + eps ||
          beatSec >= targetClip.timelineRange.end - eps
        ) {
          skipped++;
          details.push({ beatSec, clipId: targetClipId, ok: false, reason: 'edge of clip' });
          continue;
        }
      }
      try {
        await this.deps.adapter.cutClip({
          clipId: targetClipId,
          at: beatSec as never,
        });
        cuts++;
        details.push({ beatSec, clipId: targetClipId, ok: true });
      } catch (e) {
        skipped++;
        const msg = e instanceof Error ? e.message : String(e);
        details.push({ beatSec, clipId: targetClipId, ok: false, reason: msg });
        this.deps.logger.debug({ beatSec, error: msg }, 'cutOnBeats skip');
      }
    }

    this.deps.logger.info(
      { beats: params.beats.length, cuts, skipped },
      'timeline.cutOnBeats complete'
    );
    return { cuts, skipped, details };
  }

  // ─── color.applyLookByScene ───────────────────────────────────────────

  /**
   * P2-2 — Per-clip color grade.
   *
   * For each clip on the sequence: hit sidecar /color/analyze to get
   * mood, then `pickColorPresetForMood` returns a preset key, then
   * `adapter.applyColorPreset` writes it. `defaultPreset` is used when
   * analysis fails for a clip.
   */
  async applyLookByScene(params: {
    sequenceId?: string;
    defaultPreset?: string;
    sampleCount?: number;
  }): Promise<{
    graded: number;
    skipped: number;
    details: { clipId: string; preset?: string; mood?: string; ok: boolean; reason?: string }[];
  }> {
    const seqId = params.sequenceId ?? (await this.deps.adapter.getActiveSequence())?.id;
    if (!seqId) throw new Error('No active sequence');
    const clips = (await this.deps.adapter.listClips(seqId)).filter((c) => c.kind === 'video');

    const defaultPreset = params.defaultPreset ?? 'teal_orange';
    let graded = 0;
    let skipped = 0;
    const details: {
      clipId: string;
      preset?: string;
      mood?: string;
      ok: boolean;
      reason?: string;
    }[] = [];

    for (const clip of clips) {
      const path = clip.source?.path;
      if (!path) {
        skipped++;
        details.push({ clipId: clip.id, ok: false, reason: 'no media path' });
        continue;
      }
      let preset = defaultPreset;
      let mood: string | undefined;
      try {
        const analysis = await this.analyzeColor({ clipPath: path });
        mood = analysis.mood;
        preset = pickColorPresetForMood(mood as 'warm' | 'cool' | 'neutral' | 'dark' | 'bright');
      } catch (e) {
        this.deps.logger.debug(
          { clipId: clip.id, error: e instanceof Error ? e.message : String(e) },
          'applyLookByScene analyze fallback'
        );
      }
      try {
        await this.deps.adapter.applyColorPreset(clip.id, preset);
        graded++;
        details.push({ clipId: clip.id, preset, mood, ok: true });
      } catch (e) {
        skipped++;
        details.push({
          clipId: clip.id,
          preset,
          mood,
          ok: false,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
    this.deps.logger.info(
      { total: clips.length, graded, skipped },
      'color.applyLookByScene complete'
    );
    return { graded, skipped, details };
  }
}

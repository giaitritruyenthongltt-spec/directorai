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

import type { Logger } from '@directorai/shared';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import type { Clip } from '@directorai/core';
import { EFFECT_PRESETS, pickColorPresetForMood } from '@directorai/effect-library';

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
      case 'context.listEffects':
        return this.listEffects(params as { category?: string });
      case 'context.analyzeColor':
        return this.analyzeColor(params as { clipPath: string });
      case 'context.classifyScene':
        return this.classifyScene(params as { clipPath: string });
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
      'context.listEffects',
      'context.analyzeColor',
      'context.classifyScene',
      'timeline.cutOnBeats',
      'color.applyLookByScene',
    ];
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

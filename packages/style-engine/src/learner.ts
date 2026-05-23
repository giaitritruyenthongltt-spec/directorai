/**
 * Style Learner (P3.18-P3.20) — the competitive moat.
 *
 * Flow:
 *   1. CAPTURE: After an AI plan runs, snapshot the resulting Sequence
 *      (`TimelineSnapshot`). Save it as the "baseline".
 *   2. DIFF: When the user edits within a learning window (default 30 min),
 *      snapshot again and compute `EditDiff` against the baseline.
 *   3. EXTRACT: Cluster diffs over many runs → `StylePatch` (concrete
 *      tweaks to `Style` fields).
 *   4. FEEDBACK: Apply patches to derive a `Style` for the next plan run.
 *
 * The output of the learner is a derived `Style` — first-class, can be
 * saved, A/B compared, exported.
 *
 * Heuristic extractors are kept small and explicit so a future v2 can
 * replace them with an LLM extractor without touching consumers.
 */

import type { Clip, Marker, Sequence, Track } from '@directorai/core';
import type { Style } from './schema.js';

// ─── Snapshots & diffs ──────────────────────────────────────────────────────

export interface ClipSnapshot {
  readonly id: string;
  readonly name: string;
  readonly trackId: string;
  readonly start: number;
  readonly end: number;
  readonly effectMatchNames: readonly string[];
}

export interface TimelineSnapshot {
  readonly capturedAt: string; // ISO timestamp
  readonly sequenceId: string;
  readonly clips: readonly ClipSnapshot[];
  readonly markers: readonly { time: number; name: string }[];
}

export interface EditDiff {
  readonly addedClipIds: readonly string[];
  readonly removedClipIds: readonly string[];
  readonly extendedHookSec: number; // positive = user extended; negative = shortened
  readonly addedEffects: readonly { clipId: string; matchName: string }[];
  readonly removedEffects: readonly { clipId: string; matchName: string }[];
  readonly markersDelta: number;
  readonly netDurationDeltaSec: number;
}

// ─── Snapshot ──────────────────────────────────────────────────────────────

export function snapshotSequence(seq: Sequence): TimelineSnapshot {
  const clips: ClipSnapshot[] = [];
  for (const t of seq.tracks as readonly Track[]) {
    for (const c of t.clips as readonly Clip[]) {
      clips.push({
        id: c.id,
        name: c.name,
        trackId: c.trackId,
        start: c.timelineRange.start,
        end: c.timelineRange.end,
        effectMatchNames: c.effects.map((e) => e.matchName),
      });
    }
  }
  return {
    capturedAt: new Date().toISOString(),
    sequenceId: seq.id,
    clips,
    markers: (seq.markers as readonly Marker[]).map((m) => ({ time: m.time, name: m.name })),
  };
}

// ─── Diff ──────────────────────────────────────────────────────────────────

const HOOK_HORIZON_SEC = 5;

export function diffSnapshots(baseline: TimelineSnapshot, after: TimelineSnapshot): EditDiff {
  const baseIds = new Set(baseline.clips.map((c) => c.id));
  const afterIds = new Set(after.clips.map((c) => c.id));
  const addedClipIds = after.clips.filter((c) => !baseIds.has(c.id)).map((c) => c.id);
  const removedClipIds = baseline.clips.filter((c) => !afterIds.has(c.id)).map((c) => c.id);

  // Hook extension: how much did the first HOOK_HORIZON_SEC of timeline grow?
  const hookEnd = (snap: TimelineSnapshot): number =>
    snap.clips.filter((c) => c.start < HOOK_HORIZON_SEC).reduce((m, c) => Math.max(m, c.end), 0);
  const extendedHookSec = hookEnd(after) - hookEnd(baseline);

  // Effects diff per surviving clip
  const baselineEffectMap = new Map(
    baseline.clips.map((c) => [c.id, new Set(c.effectMatchNames)] as const)
  );
  const afterEffectMap = new Map(
    after.clips.map((c) => [c.id, new Set(c.effectMatchNames)] as const)
  );
  const addedEffects: { clipId: string; matchName: string }[] = [];
  const removedEffects: { clipId: string; matchName: string }[] = [];
  for (const [id, afterSet] of afterEffectMap) {
    const baseSet = baselineEffectMap.get(id) ?? new Set<string>();
    for (const mn of afterSet)
      if (!baseSet.has(mn)) addedEffects.push({ clipId: id, matchName: mn });
    for (const mn of baseSet)
      if (!afterSet.has(mn)) removedEffects.push({ clipId: id, matchName: mn });
  }

  const markersDelta = after.markers.length - baseline.markers.length;

  const totalDuration = (snap: TimelineSnapshot): number =>
    snap.clips.reduce((m, c) => Math.max(m, c.end), 0);
  const netDurationDeltaSec = totalDuration(after) - totalDuration(baseline);

  return {
    addedClipIds,
    removedClipIds,
    extendedHookSec,
    addedEffects,
    removedEffects,
    markersDelta,
    netDurationDeltaSec,
  };
}

// ─── Pattern extraction ────────────────────────────────────────────────────

export interface StylePatch {
  /** Free-text description of what the user consistently changed. */
  readonly summary: string;
  /** Partial Style override to merge into the base style. */
  readonly overrides: Partial<Style>;
  /** Confidence 0..1 based on how many runs the pattern was observed in. */
  readonly confidence: number;
  /** Provenance: which run IDs contributed to this patch. */
  readonly fromRunIds: readonly string[];
}

/**
 * Aggregate diffs across runs into patches. Heuristics only — keeps the
 * surface understandable. Replace with LLM extraction in v2.
 *
 * Heuristics implemented today:
 *  - If user repeatedly extended the hook → boost hook duration in style.
 *  - If user repeatedly removed effects of a type → demote that effect.
 *  - If user repeatedly trimmed total duration → bump removeFillers/Silence.
 */
export function extractPatches(diffs: readonly { runId: string; diff: EditDiff }[]): StylePatch[] {
  if (diffs.length === 0) return [];

  const patches: StylePatch[] = [];
  const runIds = diffs.map((d) => d.runId);

  // 1) Hook extension pattern
  const hookDeltas = diffs.map((d) => d.diff.extendedHookSec).filter((v) => Math.abs(v) > 0.5);
  if (hookDeltas.length >= Math.max(2, Math.ceil(diffs.length * 0.5))) {
    const avgDelta = hookDeltas.reduce((s, v) => s + v, 0) / hookDeltas.length;
    const direction = avgDelta > 0 ? 'extended' : 'shortened';
    patches.push({
      summary: `User consistently ${direction} the hook by ~${Math.abs(avgDelta).toFixed(1)}s`,
      overrides: {
        pacing: {
          hook: {
            durationSec: Math.max(0.5, 3 + avgDelta),
            cutsPerSec: 2,
          },
          body: { cutsPerSec: 0.8, beatSync: false },
          outro: { durationSec: 3, cutsPerSec: 1.5 },
        },
      },
      confidence: Math.min(1, hookDeltas.length / diffs.length),
      fromRunIds: runIds,
    });
  }

  // 2) Effect removal pattern
  const removedByType = new Map<string, number>();
  for (const { diff } of diffs) {
    for (const e of diff.removedEffects) {
      removedByType.set(e.matchName, (removedByType.get(e.matchName) ?? 0) + 1);
    }
  }
  const demoted: string[] = [];
  for (const [matchName, count] of removedByType) {
    if (count >= Math.max(2, Math.ceil(diffs.length * 0.5))) {
      demoted.push(matchName);
    }
  }
  if (demoted.length > 0) {
    patches.push({
      summary: `User consistently removed effects: ${demoted.join(', ')}`,
      overrides: {
        // Filter these effects out of the next plan
        effects: [],
      },
      confidence: Math.min(1, demoted.length / Math.max(1, removedByType.size)),
      fromRunIds: runIds,
    });
  }

  // 3) Aggressive trimming pattern
  const negativeDurationDeltas = diffs.map((d) => d.diff.netDurationDeltaSec).filter((v) => v < -1);
  if (negativeDurationDeltas.length >= Math.max(2, Math.ceil(diffs.length * 0.5))) {
    patches.push({
      summary: `User consistently trims duration after AI plan — tighten filler/silence detection`,
      overrides: {
        removeFillers: true,
        removeSilence: true,
        silenceThresholdDb: -38, // slightly more aggressive than default -40
        minSilenceSec: 0.3, // shorter min than default 0.5
      },
      confidence: Math.min(1, negativeDurationDeltas.length / diffs.length),
      fromRunIds: runIds,
    });
  }

  return patches;
}

// ─── Apply patches → derived style ─────────────────────────────────────────

export function applyPatches(base: Style, patches: readonly StylePatch[]): Style {
  // Only apply patches with confidence >= 0.5
  let derived: Style = { ...base };
  for (const p of patches) {
    if (p.confidence < 0.5) continue;
    derived = {
      ...derived,
      ...p.overrides,
      name: derived.name, // never overwrite name
      // Deep-merge pacing if patched
      pacing: p.overrides.pacing
        ? {
            hook: p.overrides.pacing.hook ?? derived.pacing.hook,
            body: p.overrides.pacing.body ?? derived.pacing.body,
            outro: p.overrides.pacing.outro ?? derived.pacing.outro,
          }
        : derived.pacing,
    };
  }
  return derived;
}

// ─── Persistence helpers ───────────────────────────────────────────────────

export interface LearnerRun {
  readonly runId: string;
  readonly styleName: string;
  readonly mediaPath: string;
  readonly baseline: TimelineSnapshot;
  readonly after?: TimelineSnapshot;
  readonly diff?: EditDiff;
  readonly capturedAt: string;
  readonly committedAt?: string;
}

/** In-memory store; the consumer plugs persistence (filesystem, etc). */
export class LearnerStore {
  private readonly runs = new Map<string, LearnerRun>();

  startRun(input: {
    runId: string;
    styleName: string;
    mediaPath: string;
    baseline: TimelineSnapshot;
  }): void {
    this.runs.set(input.runId, {
      runId: input.runId,
      styleName: input.styleName,
      mediaPath: input.mediaPath,
      baseline: input.baseline,
      capturedAt: input.baseline.capturedAt,
    });
  }

  commitRun(runId: string, after: TimelineSnapshot): EditDiff | null {
    const run = this.runs.get(runId);
    if (!run) return null;
    const diff = diffSnapshots(run.baseline, after);
    this.runs.set(runId, {
      ...run,
      after,
      diff,
      committedAt: new Date().toISOString(),
    });
    return diff;
  }

  listCommitted(styleName?: string): LearnerRun[] {
    return [...this.runs.values()].filter(
      (r) => !!r.diff && (!styleName || r.styleName === styleName)
    );
  }

  patchesForStyle(styleName: string): StylePatch[] {
    const runs = this.listCommitted(styleName);
    return extractPatches(
      runs.filter((r) => r.diff).map((r) => ({ runId: r.runId, diff: r.diff! }))
    );
  }
}

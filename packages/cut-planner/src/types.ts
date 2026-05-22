import type { Seconds } from '@directorai/core';

export interface MediaContext {
  readonly mediaPath: string;
  readonly durationSec: Seconds;
  readonly segments: readonly TranscriptSegment[];
  readonly scenes: readonly { start: Seconds; end: Seconds }[];
  readonly beats?: readonly Seconds[];
}

export interface TranscriptSegment {
  readonly start: Seconds;
  readonly end: Seconds;
  readonly text: string;
  readonly isFiller?: boolean;
  readonly isSilence?: boolean;
}

export interface PlanStep {
  readonly id: string;
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly reason: string;
}

export interface Plan {
  readonly style: string;
  readonly steps: readonly PlanStep[];
  readonly estimatedDurationSec: Seconds;
  readonly summary: string;
}

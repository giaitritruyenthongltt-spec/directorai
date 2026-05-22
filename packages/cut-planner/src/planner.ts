import { uniqueId } from '@directorai/shared';
import type { Style } from '@directorai/style-engine';
import type { Seconds } from '@directorai/core';
import type { MediaContext, Plan, PlanStep } from './types.js';

const FILLER_WORDS = new Set([
  'um',
  'uh',
  'er',
  'ah',
  'like',
  'you know',
  'so',
  'basically',
  'literally',
  'actually',
]);

export interface PlanInput {
  style: Style;
  context: MediaContext;
}

export function planCuts(input: PlanInput): Plan {
  const { style, context } = input;
  const steps: PlanStep[] = [];

  if (style.removeSilence) {
    for (const seg of context.segments) {
      if (seg.isSilence) {
        steps.push({
          id: uniqueId('step'),
          tool: 'timeline_deleteClip',
          args: { clipId: `seg_${seg.start}_${seg.end}` },
          reason: `Remove silence ${seg.start.toFixed(2)}-${seg.end.toFixed(2)}s`,
        });
      }
    }
  }

  if (style.removeFillers) {
    for (const seg of context.segments) {
      const words = seg.text.toLowerCase().split(/\s+/);
      if (words.every((w) => FILLER_WORDS.has(w.replace(/[^a-z]/g, '')))) {
        steps.push({
          id: uniqueId('step'),
          tool: 'timeline_deleteClip',
          args: { clipId: `seg_${seg.start}_${seg.end}` },
          reason: `Remove filler "${seg.text}"`,
        });
      }
    }
  }

  for (const trigger of style.effects) {
    if (trigger.on === 'keyword' && trigger.keywords) {
      for (const seg of context.segments) {
        const lower = seg.text.toLowerCase();
        for (const kw of trigger.keywords) {
          if (lower.includes(kw.toLowerCase())) {
            steps.push({
              id: uniqueId('step'),
              tool: 'effect_apply',
              args: {
                clipId: `seg_${seg.start}_${seg.end}`,
                effectMatchName: trigger.action,
              },
              reason: `Apply ${trigger.action} on keyword "${kw}"`,
            });
            break;
          }
        }
      }
    } else if (trigger.on === 'beat' && context.beats) {
      for (const beat of context.beats) {
        steps.push({
          id: uniqueId('step'),
          tool: 'marker_add',
          args: {
            sequenceId: 'active',
            time: beat,
            name: trigger.action,
          },
          reason: `Beat marker for ${trigger.action} at ${beat.toFixed(2)}s`,
        });
      }
    }
  }

  if (style.color.preset) {
    steps.push({
      id: uniqueId('step'),
      tool: 'color_applyPreset',
      args: { clipId: 'all', presetName: style.color.preset },
      reason: `Apply color preset "${style.color.preset}"`,
    });
  }

  const totalDuration = context.segments
    .filter((s) => !(style.removeSilence && s.isSilence))
    .reduce((sum, s) => sum + (s.end - s.start), 0);

  return {
    style: style.name,
    steps,
    estimatedDurationSec: totalDuration as Seconds,
    summary: `Plan: ${steps.length} steps, est ${totalDuration.toFixed(1)}s output for style "${style.name}"`,
  };
}

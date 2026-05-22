import { z } from 'zod';

export const PacingSchema = z.object({
  hook: z
    .object({
      durationSec: z.number().positive().default(3),
      cutsPerSec: z.number().positive().default(2),
    })
    .default({ durationSec: 3, cutsPerSec: 2 }),
  body: z
    .object({
      cutsPerSec: z.number().positive().default(0.8),
      beatSync: z.boolean().default(false),
    })
    .default({ cutsPerSec: 0.8, beatSync: false }),
  outro: z
    .object({
      durationSec: z.number().positive().default(3),
      cutsPerSec: z.number().positive().default(1.5),
    })
    .default({ durationSec: 3, cutsPerSec: 1.5 }),
});

export const EffectTriggerSchema = z.object({
  on: z.enum(['keyword', 'noun_phrase', 'silence', 'scene_change', 'beat']),
  keywords: z.array(z.string()).optional(),
  action: z.string(),
  mogrt: z.string().optional(),
  durationSec: z.number().positive().optional(),
});

export const ColorPresetSchema = z.object({
  preset: z.string().optional(),
  exposure: z.number().optional(),
  contrast: z.number().optional(),
  highlights: z.number().optional(),
  shadows: z.number().optional(),
  saturation: z.number().optional(),
  temperature: z.number().optional(),
});

export const BRollRuleSchema = z.object({
  trigger: z.enum(['keyword', 'noun_phrase', 'always']).default('noun_phrase'),
  durationSec: z.number().positive().default(1.5),
  sourceBin: z.string().default('B-roll'),
});

export const TextRuleSchema = z.object({
  mogrt: z.string(),
  fontSize: z.number().positive().default(48),
  durationSec: z.number().positive().default(2),
});

export const AudioRuleSchema = z.object({
  musicBin: z.string().optional(),
  musicGainDb: z.number().default(-12),
  duckingDb: z.number().default(-6),
  fadeInSec: z.number().nonnegative().default(0.5),
  fadeOutSec: z.number().nonnegative().default(0.5),
});

export const StyleSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  version: z.string().default('1.0'),

  pacing: PacingSchema.default({}),
  effects: z.array(EffectTriggerSchema).default([]),
  color: ColorPresetSchema.default({}),
  bRoll: BRollRuleSchema.optional(),
  text: TextRuleSchema.optional(),
  audio: AudioRuleSchema.default({}),

  removeFillers: z.boolean().default(true),
  removeSilence: z.boolean().default(true),
  silenceThresholdDb: z.number().default(-40),
  minSilenceSec: z.number().positive().default(0.5),
});

export type Style = z.infer<typeof StyleSchema>;
export type Pacing = z.infer<typeof PacingSchema>;
export type EffectTrigger = z.infer<typeof EffectTriggerSchema>;
export type ColorPreset = z.infer<typeof ColorPresetSchema>;
export type BRollRule = z.infer<typeof BRollRuleSchema>;
export type TextRule = z.infer<typeof TextRuleSchema>;
export type AudioRule = z.infer<typeof AudioRuleSchema>;

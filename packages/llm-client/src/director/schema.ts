/**
 * Sprint E.2 — Director plan schema.
 *
 * The LLM emits JSON that conforms to PlanSchema. The executor (E.3)
 * parses + validates + runs each step in order.
 */

import { z } from 'zod';

// ─── Persona ────────────────────────────────────────────────────────────

export const PersonaSchema = z.enum(['cinematic', 'action', 'vlog', 'vintage']);
export type Persona = z.infer<typeof PersonaSchema>;

export const PERSONA_DESCRIPTIONS: Record<Persona, string> = {
  cinematic: 'Slow, deliberate cuts. Wide establishing shots. Warm color grade. Music-driven.',
  action: 'Fast, beat-matched cuts. Whip pans + zoom punches. Teal & orange grade. Energy-driven.',
  vlog: 'Casual cuts on dialogue beats. Bright warm tones. Captions everywhere.',
  vintage: 'Soft dissolves. Desaturated film grade. Grain + light leaks. Nostalgic music.',
};

// ─── Step schema ────────────────────────────────────────────────────────

/**
 * One step in the plan. The `tool` is one of the 36 MCP tool IDs the
 * server exposes. `params` is whatever that tool requires.
 */
export const PlanStepSchema = z.object({
  /** 1-based step index for human display. */
  id: z.number().int().positive(),
  /** MCP tool name e.g. 'context.scanClips', 'timeline.cutClip'. */
  tool: z.string().min(1),
  /** Tool parameters. Loosely typed — the tool's own schema validates. */
  params: z.record(z.unknown()).default({}),
  /** One-line natural-language explanation shown in the UI. */
  why: z.string().min(1),
  /** If true, the executor pauses for user confirmation after this step. */
  checkpoint: z.boolean().default(false),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

// ─── Plan schema ────────────────────────────────────────────────────────

export const PlanSchema = z.object({
  /** Short title shown in the panel. */
  title: z.string().min(1).max(120),
  /** User's original goal text. */
  goal: z.string().min(1),
  /** Persona used for this plan. */
  persona: PersonaSchema,
  /** Estimated total wall-clock minutes. */
  estimatedMinutes: z.number().int().min(0).max(600),
  /** Ordered steps. */
  steps: z.array(PlanStepSchema).min(1).max(50),
  /** Optional explanatory note that's NOT a step (shown above the list). */
  note: z.string().optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

// ─── Plan execution state ──────────────────────────────────────────────

export const PlanStatusSchema = z.enum([
  'draft',
  'running',
  'paused',
  'done',
  'cancelled',
  'error',
]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanProgressSchema = z.object({
  planId: z.string(),
  status: PlanStatusSchema,
  currentStep: z.number().int().min(0),
  totalSteps: z.number().int().min(1),
  stepResults: z.array(
    z.object({
      stepId: z.number(),
      ok: z.boolean(),
      result: z.unknown().optional(),
      error: z.string().optional(),
      elapsedMs: z.number().int().min(0),
    })
  ),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
});
export type PlanProgress = z.infer<typeof PlanProgressSchema>;

/**
 * Parse loose JSON from the LLM, validate against PlanSchema, return
 * either the typed Plan or a parse error.
 */
export function parsePlan(raw: unknown): { ok: true; plan: Plan } | { ok: false; error: string } {
  const result = PlanSchema.safeParse(raw);
  if (result.success) return { ok: true, plan: result.data };
  const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  return { ok: false, error: issues };
}

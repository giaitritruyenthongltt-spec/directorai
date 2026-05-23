/**
 * LLM refinement layer over the rule-based Cut Planner.
 *
 * Workflow:
 *  1. `planCuts(style, context)` produces a deterministic rule-based Plan.
 *  2. `refinePlan(plan, style, context, llmClient)` asks Claude to:
 *     - reorder steps for better narrative flow
 *     - drop redundant steps
 *     - add steps the rules missed (e.g. a hook punch)
 *     - keep the same step shape (tool + args + reason)
 *
 * The LLM only sees the plan + a digest of the context (we don't dump full
 * transcripts — they'd blow out token budgets). If the LLM returns invalid
 * JSON or unknown tools, we fall back to the original plan and log.
 */

import type { Style } from '@directorai/style-engine';
import type { Plan, PlanStep, MediaContext } from './types.js';

export interface LLMRefinerClient {
  /** Send a single text completion request. Mirrors ILLMClient.complete shape. */
  complete(req: {
    system?: string;
    messages: readonly { role: 'user' | 'assistant'; content: string }[];
    maxTokens?: number;
  }): Promise<{ text: string }>;
}

const SYSTEM = `You are an experienced video editor reviewing an AI-generated edit plan.
Given the style intent and the rule-based plan, output a refined plan as JSON.
Keep the same step shape: { id, tool, args, reason }. You may:
  - reorder steps for better narrative flow
  - drop redundant steps
  - add steps the rules missed
Never invent tool names — only use tools already present in the plan.
Output strict JSON in the shape: { "steps": [ ... ] }. No prose.`;

function summarizeContext(ctx: MediaContext): string {
  const sampleSegments = ctx.segments
    .slice(0, 12)
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}s] ${s.text.slice(0, 80)}`)
    .join('\n');
  return [
    `media: ${ctx.mediaPath}`,
    `duration: ${ctx.durationSec.toFixed(1)}s`,
    `segments: ${ctx.segments.length} (sample below)`,
    sampleSegments,
    ctx.beats
      ? `beats: ${ctx.beats.length} (first 5 = ${ctx.beats.slice(0, 5).join(', ')})`
      : 'beats: none',
    `scenes: ${ctx.scenes.length}`,
  ].join('\n');
}

function summarizeStyle(style: Style): string {
  return JSON.stringify(
    {
      name: style.name,
      pacing: style.pacing,
      removeFillers: style.removeFillers,
      removeSilence: style.removeSilence,
      effects: style.effects.map((e) => ({ on: e.on, action: e.action })),
    },
    null,
    0
  );
}

function isValidStep(s: unknown, allowedTools: ReadonlySet<string>): s is PlanStep {
  if (!s || typeof s !== 'object') return false;
  const obj = s as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.tool === 'string' &&
    allowedTools.has(obj.tool) &&
    typeof obj.args === 'object' &&
    obj.args !== null &&
    typeof obj.reason === 'string'
  );
}

export async function refinePlan(
  plan: Plan,
  style: Style,
  context: MediaContext,
  llm: LLMRefinerClient,
  options: { maxTokens?: number } = {}
): Promise<Plan> {
  const allowedTools = new Set(plan.steps.map((s) => s.tool));
  const userPrompt = [
    'STYLE:',
    summarizeStyle(style),
    '',
    'CONTEXT:',
    summarizeContext(context),
    '',
    'RULE-BASED PLAN:',
    JSON.stringify({ steps: plan.steps }, null, 2),
    '',
    'Return refined JSON now.',
  ].join('\n');

  let refinedText: string;
  try {
    const resp = await llm.complete({
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: options.maxTokens ?? 4096,
    });
    refinedText = resp.text;
  } catch {
    // LLM unavailable — fall back to rules-only.
    return plan;
  }

  // Strip optional ```json fences
  const jsonText = refinedText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: { steps?: unknown[] };
  try {
    parsed = JSON.parse(jsonText) as { steps?: unknown[] };
  } catch {
    return plan;
  }

  if (!Array.isArray(parsed.steps)) return plan;
  const validSteps: PlanStep[] = parsed.steps.filter((s): s is PlanStep =>
    isValidStep(s, allowedTools)
  );
  if (validSteps.length === 0) return plan;

  return {
    ...plan,
    steps: validSteps,
    summary: `${plan.summary} (LLM-refined: ${validSteps.length} steps)`,
  };
}

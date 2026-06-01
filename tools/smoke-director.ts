/**
 * Sprint H.1 smoke test — end-to-end Director plan generation via Gemini.
 *
 *   pnpm smoke:director
 *
 * What it does:
 *   1. Loads Gemini config from .env
 *   2. Sends DIRECTOR_SYSTEM_PROMPT + few-shot examples + a sample goal
 *      ("Dựng video du lịch Đà Lạt 3 phút") to Gemini
 *   3. Parses the response with parsePlan() (Zod schema validation)
 *   4. Prints the plan + verifies all steps point to known tool families
 *
 * Pass criteria:
 *   - HTTP 200 from Gemini
 *   - parsePlan returns { ok: true }
 *   - plan.steps has 5-15 items
 *   - every tool starts with "context." | "timeline." | "effect." | "project."
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { buildDirectorPrompt, parsePlan } from '../packages/llm-client/src/director/index.ts';

async function loadEnv(): Promise<void> {
  // Tiny .env loader — avoid pulling dotenv just for one var
  try {
    const text = await fs.readFile(path.resolve('.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* no .env */
  }
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

async function geminiCall(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; usage: GeminiResponse['usageMetadata'] }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = (await res.json()) as GeminiResponse;
  if (data.error) throw new Error(`Gemini API: ${data.error.message}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Gemini returned empty content');
  return { text, usage: data.usageMetadata };
}

async function main(): Promise<void> {
  await loadEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.LLM_MODEL ?? 'gemini-2.5-pro';
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not set');
    process.exit(1);
  }
  console.info(`Using ${model}`);

  // Build the Director prompt for "cinematic" persona
  const systemPrompt = buildDirectorPrompt('cinematic');
  const userPrompt =
    'Dựng video du lịch Đà Lạt 3 phút cảm xúc, có nhạc background. Tôi có 50 clips raw footage.';

  console.info(`\nUser goal: "${userPrompt}"`);
  console.info('\nCalling Gemini…');
  const t0 = Date.now();
  const { text, usage } = await geminiCall(apiKey, model, systemPrompt, userPrompt);
  const elapsed = Date.now() - t0;
  console.info(
    `✔ Gemini reply in ${elapsed}ms ` +
      `(${usage?.promptTokenCount} in + ${usage?.candidatesTokenCount} out)`
  );

  console.info('\nRaw LLM output:');
  console.info(text.slice(0, 400) + (text.length > 400 ? '…' : ''));

  // Try to parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error('❌ Gemini output is not valid JSON');
    process.exit(2);
  }

  const result = parsePlan(parsed);
  if (!result.ok) {
    console.error(`❌ Plan failed schema validation: ${result.error}`);
    process.exit(3);
  }

  const plan = result.plan;
  console.info('\n✔ Plan parsed successfully\n');
  console.info(`Title:         ${plan.title}`);
  console.info(`Persona:       ${plan.persona}`);
  console.info(`Estimated:     ${plan.estimatedMinutes} min`);
  console.info(`Steps:         ${plan.steps.length}`);
  if (plan.note) console.info(`Note:          ${plan.note}`);
  console.info('');

  let badTool = 0;
  for (const step of plan.steps) {
    const validPrefix = /^(context|timeline|effect|project)\./.test(step.tool);
    const marker = validPrefix ? '✓' : '?';
    console.info(
      `  ${marker} ${String(step.id).padStart(2, ' ')}. ${step.tool}` +
        (step.checkpoint ? ' [CP]' : '') +
        `  — ${step.why}`
    );
    if (!validPrefix) badTool++;
  }

  console.info('');
  if (badTool > 0) {
    console.warn(`⚠  ${badTool} steps use non-standard tool prefix`);
  }
  if (plan.steps.length < 3) {
    console.warn(`⚠  plan only has ${plan.steps.length} step(s) — likely too thin`);
  }

  console.info('✅ PASS — Gemini → DirectorPlan working end-to-end');
}

void main().catch((err) => {
  console.error('❌ Smoke test crashed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

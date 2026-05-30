/**
 * P5.04c — Google Gemini provider.
 *
 * Direct fetch against the Generative Language API. Same no-SDK
 * rationale as OpenAI.
 *
 * Wire shapes are different enough from OpenAI/Anthropic that we
 * translate fully at the boundary:
 *
 *   - "contents" with role parts (text / functionCall / functionResponse)
 *   - "tools" carry function declarations with JSON Schema parameters
 *   - usage in `usageMetadata`
 *
 * Reference: https://ai.google.dev/api/rest/v1beta/models/generateContent
 */
import { ConfigError } from '@directorai/shared';
import type {
  ILLMClient,
  LLMRequest,
  LLMResponse,
  LLMAgentRequest,
  LLMAgentResponse,
  LLMAgentTurn,
  LLMToolCall,
} from './types.js';

export interface GeminiClientOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

interface GeminiFunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: { name: string; response: { result: string } };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates: { content: GeminiContent; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MAX_TURNS = 8;

export class GeminiClient implements ILLMClient {
  readonly provider = 'gemini' as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(opts: GeminiClientOptions) {
    if (!opts.apiKey) throw new ConfigError('GEMINI_API_KEY is required');
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gemini-1.5-pro-latest';
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.fetcher = opts.fetcher ?? fetch;
  }

  private async generate(body: Record<string, unknown>): Promise<GeminiResponse> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await this.fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${text || res.statusText}`);
    }
    return (await res.json()) as GeminiResponse;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const contents: GeminiContent[] = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 1,
      },
    };
    if (req.system) {
      body.systemInstruction = { role: 'user', parts: [{ text: req.system }] };
    }

    const res = await this.generate(body);
    const text = res.candidates[0]?.content.parts.map((p) => p.text ?? '').join('') ?? '';
    return {
      text,
      model: this.model,
      usage: {
        inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  async runAgent(req: LLMAgentRequest): Promise<LLMAgentResponse> {
    const maxTurns = req.maxTurns ?? DEFAULT_MAX_TURNS;
    const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: req.userPrompt }] }];

    const tools = req.tools.length
      ? [
          {
            functionDeclarations: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            })),
          },
        ]
      : undefined;

    const turns: LLMAgentTurn[] = [];
    const toolResults: { call: LLMToolCall; result: string; error?: string }[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: LLMAgentResponse['stopReason'] = 'end_turn';

    for (let t = 0; t < maxTurns; t++) {
      const body: Record<string, unknown> = {
        contents,
        generationConfig: { maxOutputTokens: req.maxTokens ?? 4096 },
      };
      if (tools) body.tools = tools;
      if (req.system) {
        body.systemInstruction = { role: 'user', parts: [{ text: req.system }] };
      }
      const res = await this.generate(body);
      inputTokens += res.usageMetadata?.promptTokenCount ?? 0;
      outputTokens += res.usageMetadata?.candidatesTokenCount ?? 0;

      const cand = res.candidates[0];
      if (!cand) {
        stopReason = 'end_turn';
        break;
      }
      const text = cand.content.parts.map((p) => p.text ?? '').join('');
      const toolCalls: LLMToolCall[] = cand.content.parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({
          id: `${p.functionCall!.name}_${turns.length}_${i}`,
          name: p.functionCall!.name,
          input: p.functionCall!.args ?? {},
        }));
      turns.push({ text, toolCalls });

      contents.push({ role: 'model', parts: cand.content.parts });

      if (toolCalls.length === 0) {
        stopReason = 'end_turn';
        break;
      }

      let hadError = false;
      const responseParts: GeminiPart[] = [];
      for (const tc of toolCalls) {
        try {
          const result = await req.execute(tc);
          toolResults.push({ call: tc, result });
          responseParts.push({
            functionResponse: { name: tc.name, response: { result } },
          });
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          toolResults.push({ call: tc, result: '', error: m });
          responseParts.push({
            functionResponse: { name: tc.name, response: { result: `ERROR: ${m}` } },
          });
          hadError = true;
        }
      }
      contents.push({ role: 'user', parts: responseParts });

      if (hadError && t === maxTurns - 1) stopReason = 'tool_error';
    }

    if (turns.length === maxTurns && turns[turns.length - 1]?.toolCalls.length) {
      stopReason = 'max_turns';
    }

    const finalText = turns
      .map((tr) => tr.text)
      .filter(Boolean)
      .join('\n\n');

    return {
      finalText,
      turns,
      toolResults,
      usage: { inputTokens, outputTokens },
      stopReason,
    };
  }
}

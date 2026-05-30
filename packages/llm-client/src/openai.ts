/**
 * P5.04b — OpenAI provider.
 *
 * Direct fetch against the OpenAI Chat Completions API (no `openai`
 * SDK — same rationale as our `stripe`/`discord.js` rejections:
 * we control the network surface and the SDK adds ~4 MB of
 * transitive deps).
 *
 * Tool use: the OpenAI "tools" array maps cleanly to our `LLMToolDef`,
 * and the response's `tool_calls` map to `LLMToolCall`. The agent
 * loop in `runAgent` is the same shape as the Anthropic one — we
 * just translate at the wire boundary.
 *
 * Reference: https://platform.openai.com/docs/api-reference/chat
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

export interface OpenAIClientOptions {
  apiKey: string;
  /** Default model. `gpt-4o` is the v1.4 default. */
  model?: string;
  /** Override the base URL for tests or a self-hosted proxy. */
  baseUrl?: string;
  /** Injectable fetch for tests. */
  fetcher?: typeof fetch;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAIChoiceMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIChatResponse {
  model: string;
  choices: { message: OpenAIChoiceMessage; finish_reason: string }[];
  usage: { prompt_tokens: number; completion_tokens: number };
}

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MAX_TURNS = 8;

export class OpenAIClient implements ILLMClient {
  readonly provider = 'openai' as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(opts: OpenAIClientOptions) {
    if (!opts.apiKey) throw new ConfigError('OPENAI_API_KEY is required');
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gpt-4o';
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.fetcher = opts.fetcher ?? fetch;
  }

  private async chat(body: Record<string, unknown>): Promise<OpenAIChatResponse> {
    const res = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${text || res.statusText}`);
    }
    return (await res.json()) as OpenAIChatResponse;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const messages: { role: string; content: string }[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    for (const m of req.messages) messages.push({ role: m.role, content: m.content });

    const res = await this.chat({
      model: this.model,
      messages,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 1,
    });

    return {
      text: res.choices[0]?.message.content ?? '',
      model: res.model,
      usage: {
        inputTokens: res.usage.prompt_tokens,
        outputTokens: res.usage.completion_tokens,
      },
    };
  }

  async runAgent(req: LLMAgentRequest): Promise<LLMAgentResponse> {
    const maxTurns = req.maxTurns ?? DEFAULT_MAX_TURNS;
    const messages: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
      tool_call_id?: string;
      name?: string;
    }[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.userPrompt });

    const tools = req.tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const turns: LLMAgentTurn[] = [];
    const toolResults: { call: LLMToolCall; result: string; error?: string }[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: LLMAgentResponse['stopReason'] = 'end_turn';

    for (let t = 0; t < maxTurns; t++) {
      const res = await this.chat({
        model: this.model,
        messages,
        tools,
        max_tokens: req.maxTokens ?? 4096,
      });
      inputTokens += res.usage.prompt_tokens;
      outputTokens += res.usage.completion_tokens;

      const choice = res.choices[0];
      const msg = choice?.message;
      if (!msg) {
        stopReason = 'end_turn';
        break;
      }
      const text = msg.content ?? '';
      const toolCalls = msg.tool_calls ?? [];
      turns.push({
        text,
        toolCalls: toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          input: safeParse(tc.function.arguments),
        })),
      });

      messages.push({
        role: 'assistant',
        content: text,
        tool_calls: toolCalls.length ? toolCalls : undefined,
      });

      if (toolCalls.length === 0 || choice.finish_reason === 'stop') {
        stopReason = 'end_turn';
        break;
      }

      let hadError = false;
      for (const tc of toolCalls) {
        const call: LLMToolCall = {
          id: tc.id,
          name: tc.function.name,
          input: safeParse(tc.function.arguments),
        };
        try {
          const result = await req.execute(call);
          toolResults.push({ call, result });
          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
            name: tc.function.name,
          });
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          toolResults.push({ call, result: '', error: m });
          messages.push({
            role: 'tool',
            content: `ERROR: ${m}`,
            tool_call_id: tc.id,
            name: tc.function.name,
          });
          hadError = true;
        }
      }

      if (hadError && t === maxTurns - 1) {
        stopReason = 'tool_error';
      }
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

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

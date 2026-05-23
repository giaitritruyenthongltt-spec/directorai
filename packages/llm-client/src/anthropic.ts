import Anthropic from '@anthropic-ai/sdk';
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

export interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

interface TextBlock {
  type: 'text';
  text: string;
}

type AnthropicContentBlock = ToolUseBlock | TextBlock | { type: string };

interface AnthropicMessageParam {
  role: 'user' | 'assistant';
  content: string | { type: string; [k: string]: unknown }[];
}

const DEFAULT_MAX_TURNS = 8;

export class AnthropicClient implements ILLMClient {
  readonly provider = 'anthropic' as const;
  readonly model: string;
  private client: Anthropic;

  constructor(options: AnthropicClientOptions) {
    if (!options.apiKey) {
      throw new ConfigError('ANTHROPIC_API_KEY is required');
    }
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model ?? 'claude-opus-4-7';
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const messages = req.messages.map((m) => ({
      role: m.role === 'system' ? ('user' as const) : (m.role as 'user' | 'assistant'),
      content: m.content,
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 1,
      system: req.system,
      messages,
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('');

    return {
      text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async runAgent(req: LLMAgentRequest): Promise<LLMAgentResponse> {
    const maxTurns = req.maxTurns ?? DEFAULT_MAX_TURNS;
    const messages: AnthropicMessageParam[] = [{ role: 'user', content: req.userPrompt }];

    const tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Record<string, unknown>,
    }));

    const turns: LLMAgentTurn[] = [];
    const toolResults: { call: LLMToolCall; result: string; error?: string }[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: LLMAgentResponse['stopReason'] = 'end_turn';

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 4096,
        system: req.system,
        messages: messages as Anthropic.MessageParam[],
        tools: tools as Anthropic.Tool[],
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const blocks = response.content as AnthropicContentBlock[];
      const text = blocks
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const toolUses = blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');
      turns.push({
        text,
        toolCalls: toolUses.map((u) => ({ id: u.id, name: u.name, input: u.input })),
      });

      // Append assistant response to history
      messages.push({
        role: 'assistant',
        content: blocks as { type: string; [k: string]: unknown }[],
      });

      if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
        stopReason = 'end_turn';
        break;
      }

      // Execute tools, collect results
      const toolResultContent: { type: string; [k: string]: unknown }[] = [];
      let hadError = false;
      for (const u of toolUses) {
        const call: LLMToolCall = { id: u.id, name: u.name, input: u.input };
        try {
          const result = await req.execute(call);
          toolResults.push({ call, result });
          toolResultContent.push({
            type: 'tool_result',
            tool_use_id: u.id,
            content: result,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toolResults.push({ call, result: '', error: msg });
          toolResultContent.push({
            type: 'tool_result',
            tool_use_id: u.id,
            content: `ERROR: ${msg}`,
            is_error: true,
          });
          hadError = true;
        }
      }

      messages.push({ role: 'user', content: toolResultContent });

      if (hadError && turn === maxTurns - 1) {
        stopReason = 'tool_error';
      }
    }

    if (turns.length === maxTurns && turns[turns.length - 1]?.toolCalls.length) {
      stopReason = 'max_turns';
    }

    const finalText = turns
      .map((t) => t.text)
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

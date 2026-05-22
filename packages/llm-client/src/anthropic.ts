import Anthropic from '@anthropic-ai/sdk';
import { ConfigError } from '@directorai/shared';
import type { ILLMClient, LLMRequest, LLMResponse } from './types.js';

export interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
}

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
}

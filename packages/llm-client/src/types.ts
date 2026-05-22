export type LLMProvider = 'anthropic' | 'openai' | 'gemini';

export interface LLMMessage {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
}

export interface LLMRequest {
  readonly messages: readonly LLMMessage[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly system?: string;
}

export interface LLMResponse {
  readonly text: string;
  readonly model: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

export interface ILLMClient {
  readonly provider: LLMProvider;
  readonly model: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
}

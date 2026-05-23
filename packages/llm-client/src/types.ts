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

// ─── Agent / tool-use ───────────────────────────────────────────────────────

export interface LLMToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface LLMAgentTurn {
  readonly text: string;
  readonly toolCalls: readonly LLMToolCall[];
}

export interface LLMAgentRequest {
  readonly userPrompt: string;
  readonly system?: string;
  readonly tools: readonly LLMToolDef[];
  /** Async tool executor — given a tool call, return a string result. */
  readonly execute: (call: LLMToolCall) => Promise<string>;
  readonly maxTurns?: number;
  readonly maxTokens?: number;
}

export interface LLMAgentResponse {
  readonly finalText: string;
  readonly turns: readonly LLMAgentTurn[];
  readonly toolResults: readonly { call: LLMToolCall; result: string; error?: string }[];
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  readonly stopReason: 'end_turn' | 'max_turns' | 'tool_error';
}

export interface ILLMClient {
  readonly provider: LLMProvider;
  readonly model: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
  /** Optional agent loop with tool use — supported by anthropic, may be missing on legacy backends. */
  runAgent?(req: LLMAgentRequest): Promise<LLMAgentResponse>;
}

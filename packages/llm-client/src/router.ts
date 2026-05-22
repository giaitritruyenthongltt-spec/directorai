import { AnthropicClient } from './anthropic.js';
import type { ILLMClient, LLMProvider, LLMRequest, LLMResponse } from './types.js';

export interface RouterOptions {
  primary: ILLMClient;
  fallbacks?: ILLMClient[];
}

export class LLMRouter implements ILLMClient {
  readonly provider: LLMProvider;
  readonly model: string;
  private primary: ILLMClient;
  private fallbacks: ILLMClient[];

  constructor(options: RouterOptions) {
    this.primary = options.primary;
    this.fallbacks = options.fallbacks ?? [];
    this.provider = options.primary.provider;
    this.model = options.primary.model;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    try {
      return await this.primary.complete(req);
    } catch (err) {
      for (const fb of this.fallbacks) {
        try {
          return await fb.complete(req);
        } catch {
          // try next
        }
      }
      throw err;
    }
  }
}

export function createDefaultRouter(anthropicKey: string): LLMRouter {
  return new LLMRouter({
    primary: new AnthropicClient({ apiKey: anthropicKey }),
  });
}

/**
 * P5.04d — Multi-provider LLM router.
 *
 * Three pieces:
 *
 *   1. `LLMRouter` — primary + fallback chain. Routes a `complete`
 *      or `runAgent` call to the first provider that succeeds.
 *   2. `routeForTask(task)` — picks a provider based on a small
 *      enum of task profiles ("agent", "cheap-classify", "refine").
 *      Lets callers say "give me the cheapest model that can do X"
 *      without knowing model names.
 *   3. `createDefaultRouter(env)` — backwards-compat factory that
 *      uses whatever API keys are in the env (BYOK pattern). At
 *      least one provider key is required; others extend the
 *      fallback chain.
 */
import { AnthropicClient } from './anthropic.js';
import { OpenAIClient } from './openai.js';
import { GeminiClient } from './gemini.js';
import type {
  ILLMClient,
  LLMAgentRequest,
  LLMAgentResponse,
  LLMProvider,
  LLMRequest,
  LLMResponse,
} from './types.js';

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

  private get chain(): ILLMClient[] {
    return [this.primary, ...this.fallbacks];
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    let last: unknown;
    for (const c of this.chain) {
      try {
        return await c.complete(req);
      } catch (err) {
        last = err;
      }
    }
    throw last instanceof Error ? last : new Error('All LLM providers failed');
  }

  async runAgent(req: LLMAgentRequest): Promise<LLMAgentResponse> {
    let last: unknown;
    for (const c of this.chain) {
      if (!c.runAgent) continue;
      try {
        return await c.runAgent(req);
      } catch (err) {
        last = err;
      }
    }
    throw last instanceof Error
      ? last
      : new Error('No LLM provider in the chain supports runAgent');
  }
}

// ─── Task-driven routing ──────────────────────────────────────────────────

export type TaskProfile =
  /** Heavy agent loop with many tool calls — use the strongest model. */
  | 'agent'
  /** Single-shot classification / regex-ish — use the cheap+fast model. */
  | 'cheap-classify'
  /** Refine a deterministic plan; quality matters but it's one call. */
  | 'refine'
  /** Default — same as agent. */
  | 'default';

export interface ProviderRegistry {
  anthropic?: { strong?: ILLMClient; cheap?: ILLMClient };
  openai?: { strong?: ILLMClient; cheap?: ILLMClient };
  gemini?: { strong?: ILLMClient; cheap?: ILLMClient };
}

/**
 * Given a registry of providers and a task profile, build the
 * primary + fallback chain. Priority order:
 *
 *   agent + refine  → Anthropic strong > OpenAI strong > Gemini strong
 *   cheap-classify  → Anthropic cheap   > OpenAI cheap   > Gemini cheap
 *
 * Falls back to whatever's defined; missing keys are silently
 * skipped (so a single-provider deploy still works).
 */
export function routeForTask(reg: ProviderRegistry, task: TaskProfile = 'default'): LLMRouter {
  const wantCheap = task === 'cheap-classify';
  const pick = (
    p: { strong?: ILLMClient; cheap?: ILLMClient } | undefined
  ): ILLMClient | undefined => (wantCheap ? (p?.cheap ?? p?.strong) : (p?.strong ?? p?.cheap));

  const order = [pick(reg.anthropic), pick(reg.openai), pick(reg.gemini)].filter(
    (c): c is ILLMClient => c !== undefined
  );
  if (order.length === 0) {
    throw new Error('routeForTask: no LLM providers configured');
  }
  return new LLMRouter({ primary: order[0]!, fallbacks: order.slice(1) });
}

// ─── BYOK convenience ───────────────────────────────────────────────────────

export interface ProviderKeys {
  anthropic?: string;
  openai?: string;
  gemini?: string;
  /** Optional model overrides; uses provider defaults otherwise. */
  anthropicStrongModel?: string;
  anthropicCheapModel?: string;
  openaiStrongModel?: string;
  openaiCheapModel?: string;
  geminiStrongModel?: string;
  geminiCheapModel?: string;
}

/**
 * Build a `ProviderRegistry` from whichever keys are present.
 * Used by the boot script to honour user-supplied keys (BYOK).
 *
 * "strong" = the flagship model for that provider; "cheap" = the
 * Haiku/Mini/Flash variant. Defaults chosen as of 2026 Q2; override
 * via the optional `*Model` fields for newer releases.
 */
export function registryFromKeys(keys: ProviderKeys): ProviderRegistry {
  const reg: ProviderRegistry = {};
  if (keys.anthropic) {
    reg.anthropic = {
      strong: new AnthropicClient({
        apiKey: keys.anthropic,
        model: keys.anthropicStrongModel ?? 'claude-opus-4-7',
      }),
      cheap: new AnthropicClient({
        apiKey: keys.anthropic,
        model: keys.anthropicCheapModel ?? 'claude-haiku-4-5-20251001',
      }),
    };
  }
  if (keys.openai) {
    reg.openai = {
      strong: new OpenAIClient({
        apiKey: keys.openai,
        model: keys.openaiStrongModel ?? 'gpt-4o',
      }),
      cheap: new OpenAIClient({
        apiKey: keys.openai,
        model: keys.openaiCheapModel ?? 'gpt-4o-mini',
      }),
    };
  }
  if (keys.gemini) {
    reg.gemini = {
      strong: new GeminiClient({
        apiKey: keys.gemini,
        model: keys.geminiStrongModel ?? 'gemini-1.5-pro-latest',
      }),
      cheap: new GeminiClient({
        apiKey: keys.gemini,
        model: keys.geminiCheapModel ?? 'gemini-1.5-flash-latest',
      }),
    };
  }
  return reg;
}

/**
 * Backwards-compatible factory — keeps the old single-key signature
 * working for callers that only need Anthropic.
 */
export function createDefaultRouter(anthropicKey: string): LLMRouter {
  return new LLMRouter({
    primary: new AnthropicClient({ apiKey: anthropicKey }),
  });
}

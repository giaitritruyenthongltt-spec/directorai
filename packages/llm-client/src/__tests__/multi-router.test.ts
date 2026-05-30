import { describe, it, expect } from 'vitest';
import { LLMRouter, routeForTask, registryFromKeys, type ProviderRegistry } from '../router.js';
import type {
  ILLMClient,
  LLMAgentRequest,
  LLMAgentResponse,
  LLMProvider,
  LLMResponse,
} from '../types.js';

function mock(
  provider: LLMProvider,
  label: string,
  opts: { failComplete?: boolean; failAgent?: boolean; noAgent?: boolean } = {}
): ILLMClient {
  const client: ILLMClient = {
    provider,
    model: label,
    complete: async (): Promise<LLMResponse> => {
      if (opts.failComplete) throw new Error(`${label}: complete failed`);
      return { text: label, model: label, usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  if (!opts.noAgent) {
    client.runAgent = async (): Promise<LLMAgentResponse> => {
      if (opts.failAgent) throw new Error(`${label}: agent failed`);
      return {
        finalText: `${label} agent`,
        turns: [{ text: label, toolCalls: [] }],
        toolResults: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        stopReason: 'end_turn',
      };
    };
  }
  return client;
}

describe('LLMRouter (P5.04a)', () => {
  it('chains complete through fallbacks', async () => {
    const router = new LLMRouter({
      primary: mock('anthropic', 'A', { failComplete: true }),
      fallbacks: [mock('openai', 'O')],
    });
    const r = await router.complete({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.text).toBe('O');
  });

  it('runAgent skips providers that lack the capability', async () => {
    const router = new LLMRouter({
      primary: mock('anthropic', 'A', { noAgent: true }),
      fallbacks: [mock('openai', 'O')],
    });
    const fakeReq: LLMAgentRequest = {
      userPrompt: 'hi',
      tools: [],
      execute: async () => '',
    };
    const r = await router.runAgent(fakeReq);
    expect(r.finalText).toBe('O agent');
  });

  it('runAgent throws when no provider supports it', async () => {
    const router = new LLMRouter({
      primary: mock('anthropic', 'A', { noAgent: true }),
      fallbacks: [mock('openai', 'O', { noAgent: true })],
    });
    await expect(
      router.runAgent({ userPrompt: 'x', tools: [], execute: async () => '' })
    ).rejects.toThrow(/supports runAgent/);
  });
});

describe('routeForTask (P5.04d)', () => {
  const reg: ProviderRegistry = {
    anthropic: { strong: mock('anthropic', 'opus'), cheap: mock('anthropic', 'haiku') },
    openai: { strong: mock('openai', 'gpt4o'), cheap: mock('openai', 'gpt4o-mini') },
    gemini: { strong: mock('gemini', 'pro'), cheap: mock('gemini', 'flash') },
  };

  it('agent picks the strongest models in Anthropic→OpenAI→Gemini order', async () => {
    const router = routeForTask(reg, 'agent');
    expect(router.model).toBe('opus');
    const r = await router.complete({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.text).toBe('opus');
  });

  it('cheap-classify picks the cheap models', async () => {
    const router = routeForTask(reg, 'cheap-classify');
    expect(router.model).toBe('haiku');
  });

  it('refine defaults to strong models', async () => {
    expect(routeForTask(reg, 'refine').model).toBe('opus');
  });

  it('falls back when one provider is absent', async () => {
    const partial: ProviderRegistry = { openai: { strong: mock('openai', 'gpt4o') } };
    const router = routeForTask(partial, 'agent');
    expect(router.provider).toBe('openai');
  });

  it('throws when nothing is configured', () => {
    expect(() => routeForTask({})).toThrow(/no LLM providers/);
  });
});

describe('registryFromKeys (P5.04d BYOK)', () => {
  it('skips providers with no key', () => {
    const reg = registryFromKeys({ openai: 'sk-test' });
    expect(reg.openai).toBeDefined();
    expect(reg.anthropic).toBeUndefined();
    expect(reg.gemini).toBeUndefined();
  });

  it('builds strong + cheap entries for each configured key', () => {
    const reg = registryFromKeys({
      anthropic: 'sk-ant',
      openai: 'sk-oai',
      gemini: 'gk',
    });
    expect(reg.anthropic?.strong?.provider).toBe('anthropic');
    expect(reg.anthropic?.cheap?.provider).toBe('anthropic');
    expect(reg.openai?.strong?.provider).toBe('openai');
    expect(reg.openai?.cheap?.model).toBe('gpt-4o-mini');
    expect(reg.gemini?.strong?.model).toBe('gemini-1.5-pro-latest');
  });

  it('honours model overrides', () => {
    const reg = registryFromKeys({
      anthropic: 'sk-ant',
      anthropicStrongModel: 'custom-opus',
      anthropicCheapModel: 'custom-haiku',
    });
    expect(reg.anthropic?.strong?.model).toBe('custom-opus');
    expect(reg.anthropic?.cheap?.model).toBe('custom-haiku');
  });
});

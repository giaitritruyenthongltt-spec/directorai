import { describe, it, expect } from 'vitest';
import { LLMRouter } from '../router.js';
import type { ILLMClient, LLMResponse } from '../types.js';

function makeMock(
  provider: 'anthropic' | 'openai' | 'gemini' = 'anthropic',
  shouldFail = false
): ILLMClient {
  return {
    provider,
    model: 'mock',
    complete: async () => {
      if (shouldFail) throw new Error('mock failure');
      return {
        text: `from ${provider}`,
        model: 'mock',
        usage: { inputTokens: 1, outputTokens: 1 },
      } satisfies LLMResponse;
    },
  };
}

describe('LLMRouter', () => {
  it('uses primary when it works', async () => {
    const router = new LLMRouter({ primary: makeMock('anthropic') });
    const result = await router.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.text).toBe('from anthropic');
  });

  it('falls back to next client when primary fails', async () => {
    const router = new LLMRouter({
      primary: makeMock('anthropic', true),
      fallbacks: [makeMock('openai')],
    });
    const result = await router.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.text).toBe('from openai');
  });

  it('throws original error when all fail', async () => {
    const router = new LLMRouter({
      primary: makeMock('anthropic', true),
      fallbacks: [makeMock('openai', true)],
    });
    await expect(router.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      'mock failure'
    );
  });

  it('exposes primary provider + model', () => {
    const router = new LLMRouter({ primary: makeMock('anthropic') });
    expect(router.provider).toBe('anthropic');
    expect(router.model).toBe('mock');
  });
});

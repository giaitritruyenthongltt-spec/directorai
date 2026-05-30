import { describe, it, expect } from 'vitest';
import { OpenAIClient } from '../openai.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenAIClient (P5.04b)', () => {
  it('complete() shapes the request and parses the response', async () => {
    let captured: { url: string; body: { model: string; messages: unknown[] } } | null = null;
    const fakeFetch = (async (url: string, init: { body?: string }) => {
      captured = { url, body: JSON.parse(init.body ?? '{}') };
      return jsonResponse({
        model: 'gpt-4o',
        choices: [
          { message: { role: 'assistant', content: 'hello there' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      });
    }) as unknown as typeof fetch;

    const client = new OpenAIClient({ apiKey: 'sk-test', fetcher: fakeFetch });
    const res = await client.complete({
      messages: [{ role: 'user', content: 'hi' }],
      system: 'be concise',
    });

    expect(res.text).toBe('hello there');
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 4 });

    const sent = captured as unknown as {
      url: string;
      body: { model: string; messages: { role: string; content: string }[] };
    };
    expect(sent.url).toContain('/chat/completions');
    expect(sent.body.model).toBe('gpt-4o');
    expect(sent.body.messages[0]).toEqual({ role: 'system', content: 'be concise' });
    expect(sent.body.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('throws on non-2xx with the body in the message', async () => {
    const fakeFetch = (async () =>
      new Response('quota exceeded', { status: 429 })) as unknown as typeof fetch;
    const client = new OpenAIClient({ apiKey: 'sk-test', fetcher: fakeFetch });
    await expect(client.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
      /OpenAI 429.*quota/
    );
  });

  it('rejects construction without an API key', () => {
    expect(() => new OpenAIClient({ apiKey: '' })).toThrow();
  });

  it('runAgent loops tools then returns finalText', async () => {
    let turn = 0;
    const fakeFetch = (async () => {
      turn++;
      if (turn === 1) {
        return jsonResponse({
          model: 'gpt-4o',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'calling tool',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'project_get', arguments: '{}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 5 },
        });
      }
      return jsonResponse({
        model: 'gpt-4o',
        choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 2, completion_tokens: 2 },
      });
    }) as unknown as typeof fetch;

    const client = new OpenAIClient({ apiKey: 'sk-test', fetcher: fakeFetch });
    const res = await client.runAgent({
      userPrompt: 'get the project',
      tools: [{ name: 'project_get', description: 'get project', inputSchema: {} }],
      execute: async () => 'project name = Sample',
      maxTurns: 5,
    });

    expect(res.finalText).toContain('done');
    expect(res.turns).toHaveLength(2);
    expect(res.toolResults[0]?.call.name).toBe('project_get');
    expect(res.toolResults[0]?.result).toBe('project name = Sample');
    expect(res.stopReason).toBe('end_turn');
  });

  it('runAgent surfaces tool errors as is_error tool results without throwing', async () => {
    const fakeFetch = (async () =>
      jsonResponse({
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'broken', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })) as unknown as typeof fetch;

    const client = new OpenAIClient({ apiKey: 'sk-test', fetcher: fakeFetch });
    const res = await client.runAgent({
      userPrompt: 'run broken',
      tools: [{ name: 'broken', description: 'fail', inputSchema: {} }],
      execute: async () => {
        throw new Error('tool exploded');
      },
      maxTurns: 1,
    });
    expect(res.toolResults[0]?.error).toBe('tool exploded');
  });
});

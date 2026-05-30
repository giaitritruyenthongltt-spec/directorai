import { describe, it, expect } from 'vitest';
import { GeminiClient } from '../gemini.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GeminiClient (P5.04c)', () => {
  it('complete() translates messages → contents and parses text', async () => {
    let captured: {
      url: string;
      body: { contents: { role: string; parts: { text: string }[] }[] };
    } | null = null;
    const fakeFetch = (async (url: string, init: { body?: string }) => {
      captured = { url, body: JSON.parse(init.body ?? '{}') };
      return jsonResponse({
        candidates: [{ content: { role: 'model', parts: [{ text: 'hi back' }] } }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
      });
    }) as unknown as typeof fetch;

    const client = new GeminiClient({ apiKey: 'k-test', fetcher: fakeFetch });
    const res = await client.complete({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'sup' },
      ],
    });

    expect(res.text).toBe('hi back');
    expect(res.usage).toEqual({ inputTokens: 3, outputTokens: 2 });

    const sent = captured as unknown as {
      url: string;
      body: { contents: { role: string; parts: { text: string }[] }[] };
    };
    expect(sent.url).toContain('generateContent?key=k-test');
    expect(sent.body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'hi' }] });
    expect(sent.body.contents[1]).toEqual({ role: 'model', parts: [{ text: 'sup' }] });
  });

  it('throws on non-2xx with body in error message', async () => {
    const fakeFetch = (async () =>
      new Response('quota exceeded', { status: 429 })) as unknown as typeof fetch;
    const client = new GeminiClient({ apiKey: 'k', fetcher: fakeFetch });
    await expect(client.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
      /Gemini 429.*quota/
    );
  });

  it('rejects construction without an API key', () => {
    expect(() => new GeminiClient({ apiKey: '' })).toThrow();
  });

  it('runAgent executes a functionCall and ships a functionResponse', async () => {
    let turn = 0;
    let secondBody: { contents: { role: string }[] } | null = null;
    const fakeFetch = (async (_url: string, init: { body?: string }) => {
      turn++;
      if (turn === 1) {
        return jsonResponse({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { name: 'project_get', args: {} } }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 4 },
        });
      }
      secondBody = JSON.parse(init.body ?? '{}');
      return jsonResponse({
        candidates: [{ content: { role: 'model', parts: [{ text: 'done' }] } }],
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 2 },
      });
    }) as unknown as typeof fetch;

    const client = new GeminiClient({ apiKey: 'k', fetcher: fakeFetch });
    const res = await client.runAgent({
      userPrompt: 'get the project',
      tools: [{ name: 'project_get', description: 'get project', inputSchema: {} }],
      execute: async () => 'project name = Sample',
      maxTurns: 5,
    });

    expect(res.finalText).toContain('done');
    expect(res.toolResults[0]?.call.name).toBe('project_get');
    expect(res.toolResults[0]?.result).toBe('project name = Sample');
    expect(res.stopReason).toBe('end_turn');

    // The second turn should carry the functionResponse part back.
    const sent = secondBody as unknown as {
      contents: { role: string; parts: { functionResponse?: { name: string } }[] }[];
    };
    const lastTurn = sent.contents[sent.contents.length - 1]!;
    expect(lastTurn.role).toBe('user');
    expect(lastTurn.parts[0]?.functionResponse?.name).toBe('project_get');
  });
});

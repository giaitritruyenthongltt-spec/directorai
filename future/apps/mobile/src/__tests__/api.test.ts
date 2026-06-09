import { describe, it, expect } from 'vitest';
import { editStyle, getProjectSnapshot, login, previewStyle } from '../index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('mobile companion api (P5.08a-c)', () => {
  it('login pings project.get + returns context', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init: { body?: string }) => {
      calls.push(JSON.parse(init.body ?? '{}').method);
      return jsonResponse({ result: { metadata: { name: 'X' } } });
    }) as unknown as typeof fetch;
    const ctx = await login('https://srv', 'tkn', fakeFetch);
    expect(ctx.serverUrl).toBe('https://srv');
    expect(calls[0]).toBe('project.get');
  });

  it('login throws on non-2xx', async () => {
    const fakeFetch = (async () =>
      new Response('nope', { status: 401 })) as unknown as typeof fetch;
    await expect(login('https://srv', 'bad', fakeFetch)).rejects.toThrow(/401/);
  });

  it('getProjectSnapshot composes 3 RPCs into one payload', async () => {
    let n = 0;
    const responses = [
      { result: { metadata: { name: 'My Project' } } },
      { result: { name: 'Sequence 01' } },
      { result: { styles: ['vlog', 'cinematic', 'podcast'] } },
    ];
    const fakeFetch = (async () => jsonResponse(responses[n++]!)) as unknown as typeof fetch;
    const snap = await getProjectSnapshot({ serverUrl: 's', token: 't', fetcher: fakeFetch });
    expect(snap.projectName).toBe('My Project');
    expect(snap.activeSequenceName).toBe('Sequence 01');
    expect(snap.styleCount).toBe(3);
  });

  it('editStyle posts the yaml under style.save', async () => {
    let captured: { method: string; params: unknown } | null = null;
    const fakeFetch = (async (_url: string, init: { body?: string }) => {
      captured = JSON.parse(init.body ?? '{}');
      return jsonResponse({ result: { ok: true } });
    }) as unknown as typeof fetch;
    await editStyle({ serverUrl: 's', token: 't', fetcher: fakeFetch }, 'vlog', 'name: vlog');
    const sent = captured as unknown as { method: string; params: { name: string; yaml: string } };
    expect(sent.method).toBe('style.save');
    expect(sent.params.name).toBe('vlog');
  });

  it('previewStyle hits style.dryRun', async () => {
    let captured: { method: string } | null = null;
    const fakeFetch = (async (_url: string, init: { body?: string }) => {
      captured = JSON.parse(init.body ?? '{}');
      return jsonResponse({
        result: { steps: 12, estimatedDurationSec: 30, report: 'ok' },
      });
    }) as unknown as typeof fetch;
    const r = await previewStyle({ serverUrl: 's', token: 't', fetcher: fakeFetch }, 'name: vlog', {
      mediaPath: 'p',
      durationSec: 30,
      segments: [],
      scenes: [],
    });
    expect(r.steps).toBe(12);
    const sent = captured as unknown as { method: string };
    expect(sent.method).toBe('style.dryRun');
  });

  it('RPC errors surface as thrown errors', async () => {
    const fakeFetch = (async () =>
      jsonResponse({ error: { message: 'no active project' } })) as unknown as typeof fetch;
    await expect(
      getProjectSnapshot({ serverUrl: 's', token: 't', fetcher: fakeFetch })
    ).rejects.toThrow(/no active project/);
  });
});

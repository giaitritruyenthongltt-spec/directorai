import { describe, it, expect } from 'vitest';
import { DiscordPoster, CHANNEL_LAYOUT, WELCOME_TEMPLATE } from '../index.js';

describe('DiscordPoster (P4.36)', () => {
  it('returns ok:false when no webhook url is set', async () => {
    const p = new DiscordPoster('');
    const res = await p.message('hi');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('no webhook');
  });

  it('posts JSON body to the configured webhook', async () => {
    let captured: { url: string; body: unknown } | null = null;
    const fakeFetch = (async (url: string, init: { body?: string }) => {
      captured = { url, body: JSON.parse(init.body ?? '{}') };
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    const p = new DiscordPoster('https://discord.example/hook', { fetcher: fakeFetch });
    const res = await p.post({
      content: 'beta build dropped',
      embeds: [{ title: 'v0.9.0-beta', description: 'sample release' }],
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(204);
    expect(captured).not.toBeNull();
    const sent = captured as unknown as {
      url: string;
      body: { content: string; embeds: { title: string }[] };
    };
    expect(sent.url).toBe('https://discord.example/hook');
    expect(sent.body.content).toBe('beta build dropped');
    expect(sent.body.embeds[0]!.title).toBe('v0.9.0-beta');
  });

  it('surfaces network errors as ok:false', async () => {
    const failing = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const p = new DiscordPoster('https://discord.example/hook', { fetcher: failing });
    const res = await p.message('x');
    expect(res.ok).toBe(false);
    expect(res.message).toBe('ECONNREFUSED');
  });
});

describe('Channel layout + welcome template (P4.36)', () => {
  it('has at least 5 categories of channels', () => {
    expect(CHANNEL_LAYOUT.length).toBeGreaterThanOrEqual(5);
  });

  it('every category has at least 1 channel', () => {
    for (const cat of CHANNEL_LAYOUT) {
      expect(cat.channels.length).toBeGreaterThan(0);
    }
  });

  it('welcome template mentions the canonical channels', () => {
    expect(WELCOME_TEMPLATE).toMatch(/#announcements/);
    expect(WELCOME_TEMPLATE).toMatch(/#bugs/);
    expect(WELCOME_TEMPLATE).toMatch(/#styles/);
    expect(WELCOME_TEMPLATE).toMatch(/#feedback/);
  });
});

import { describe, it, expect } from 'vitest';
import { DiscordPoster, nextSurveyAt, sendWeeklySurvey, SurveyConfigSchema } from '../index.js';

describe('nextSurveyAt (P4.37)', () => {
  it('schedules the next Friday 17:00 when called on Monday', () => {
    // 2026-06-01 is a Monday
    const monday = new Date('2026-06-01T10:00:00');
    const next = nextSurveyAt(monday);
    expect(next.getDay()).toBe(5); // Friday
    expect(next.getHours()).toBe(17);
    expect(next.getDate()).toBe(5); // 2026-06-05 = Fri
  });

  it('rolls to next week when called on Friday after the fire time', () => {
    const fridayAfter = new Date('2026-06-05T18:00:00');
    const next = nextSurveyAt(fridayAfter);
    expect(next.getDay()).toBe(5);
    expect(next.getDate()).toBe(12); // next Friday
  });

  it('returns same Friday if called Friday morning', () => {
    const fridayMorning = new Date('2026-06-05T09:00:00');
    const next = nextSurveyAt(fridayMorning);
    expect(next.getDate()).toBe(5);
    expect(next.getHours()).toBe(17);
  });

  it('honours custom rule', () => {
    const monday = new Date('2026-06-01T10:00:00');
    const next = nextSurveyAt(monday, { weekday: 3, hour: 9, minute: 30 });
    expect(next.getDay()).toBe(3); // Wednesday
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(30);
  });
});

describe('sendWeeklySurvey (P4.37)', () => {
  it('posts a styled embed to the configured webhook', async () => {
    let body: { embeds: { title: string; url: string }[] } | null = null;
    const fakeFetch = (async (_url: string, init: { body?: string }) => {
      body = JSON.parse(init.body ?? '{}');
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const poster = new DiscordPoster('https://discord.example/hook', { fetcher: fakeFetch });

    const config = SurveyConfigSchema.parse({ tallyUrl: 'https://tally.so/r/abc' });
    const res = await sendWeeklySurvey(poster, config, new Date('2026-06-05T17:00:00Z'));

    expect(res.ok).toBe(true);
    expect(body).not.toBeNull();
    const sent = body as unknown as { embeds: { title: string; url: string }[] };
    expect(sent.embeds[0]!.title).toMatch(/check-in/i);
    expect(sent.embeds[0]!.url).toBe('https://tally.so/r/abc');
  });

  it('SurveyConfigSchema rejects non-URL tally values', () => {
    expect(() => SurveyConfigSchema.parse({ tallyUrl: 'not-a-url' })).toThrow();
  });
});

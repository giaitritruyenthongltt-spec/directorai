/**
 * P4.37 — Weekly survey scheduler.
 *
 * Two halves:
 *
 *   1. Scheduler (`nextSurveyAt`) — given a clock + cron-like "every
 *      Friday at 17:00 local" rule, returns the next fire time.
 *      Deterministic + side-effect-free so it's trivially testable.
 *   2. Notifier (`sendWeeklySurvey`) — given a Tally URL + a Discord
 *      poster, formats the embed and ships it.
 *
 * The collector half (pull Tally responses into Notion) is a
 * separate concern that lives in the survey-collector tool — see
 * `tools/survey-collect.ts` (owner-completed once Tally API key
 * lands).
 */
import { z } from 'zod';
import type { DiscordPoster, DiscordEmbed } from './discord.js';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ScheduleRule {
  /** 0 = Sunday, 5 = Friday, 6 = Saturday. */
  readonly weekday: Weekday;
  /** 0..23 — local hour the survey fires. */
  readonly hour: number;
  /** 0..59. */
  readonly minute: number;
}

const DEFAULT_RULE: ScheduleRule = { weekday: 5, hour: 17, minute: 0 };

/**
 * Returns the next epoch-ms the schedule fires *after* `from`. Local
 * to the host running the scheduler — no timezone gymnastics yet.
 */
export function nextSurveyAt(from: Date, rule: ScheduleRule = DEFAULT_RULE): Date {
  const candidate = new Date(from);
  candidate.setHours(rule.hour, rule.minute, 0, 0);
  let diffDays = (rule.weekday - candidate.getDay() + 7) % 7;
  if (diffDays === 0 && candidate <= from) diffDays = 7;
  candidate.setDate(candidate.getDate() + diffDays);
  return candidate;
}

export const SurveyConfigSchema = z.object({
  tallyUrl: z.string().url(),
  title: z.string().default('Weekly DirectorAI check-in'),
  body: z.string().default('Five questions, two minutes. Tells us what to fix next sprint.'),
});
export type SurveyConfig = z.infer<typeof SurveyConfigSchema>;

export async function sendWeeklySurvey(
  poster: DiscordPoster,
  config: SurveyConfig,
  now: Date = new Date()
): Promise<{ ok: boolean }> {
  const embed: DiscordEmbed = {
    title: config.title,
    description: config.body,
    url: config.tallyUrl,
    color: 0x4c8bf5,
    footer: { text: `Week of ${now.toISOString().slice(0, 10)}` },
    timestamp: now.toISOString(),
  };
  const res = await poster.post({ embeds: [embed] });
  return { ok: res.ok };
}

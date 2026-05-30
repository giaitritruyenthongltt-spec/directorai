/**
 * P4.37 — Survey scheduler runner.
 *
 *   pnpm survey:send       → posts the survey embed now (manual trigger)
 *   pnpm survey:next       → prints the next scheduled fire time
 *
 * In production this runs as a Windows Task Scheduler job at the
 * cadence in `community.nextSurveyAt`. Owner-completed: the actual
 * scheduler setup is documented in `docs/guides/beta-program.md`.
 *
 * Required env:
 *   DISCORD_SURVEY_WEBHOOK   the channel webhook URL
 *   TALLY_SURVEY_URL         the public Tally form URL
 */
import {
  DiscordPoster,
  SurveyConfigSchema,
  nextSurveyAt,
  sendWeeklySurvey,
} from '../packages/community/src/index.js';

const mode = process.argv[2] ?? 'send';

if (mode === 'next') {
  const next = nextSurveyAt(new Date());
  console.info(`Next survey fires at ${next.toISOString()}`);
  process.exit(0);
}

const webhook = process.env.DISCORD_SURVEY_WEBHOOK;
const tally = process.env.TALLY_SURVEY_URL;
if (!webhook || !tally) {
  console.error('Need DISCORD_SURVEY_WEBHOOK + TALLY_SURVEY_URL in env to send');
  process.exit(1);
}

const poster = new DiscordPoster(webhook);
const config = SurveyConfigSchema.parse({ tallyUrl: tally });

void sendWeeklySurvey(poster, config).then((res) => {
  if (res.ok) {
    console.info('Survey posted.');
  } else {
    console.error('Survey post failed.');
    process.exit(2);
  }
});

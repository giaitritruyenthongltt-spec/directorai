#!/usr/bin/env node
/**
 * P4.35 entry point. Env vars:
 *
 *   LANDING_PORT             default 7795
 *   WAITLIST_PATH            override the JSONL location
 *   DISCORD_WAITLIST_WEBHOOK Discord webhook ping URL (optional)
 */
import { startLanding } from './server.js';
import { WaitlistStore } from './waitlist-store.js';

async function main(): Promise<void> {
  const port = Number(process.env.LANDING_PORT ?? '7795');
  const store = process.env.WAITLIST_PATH
    ? new WaitlistStore(process.env.WAITLIST_PATH)
    : new WaitlistStore();
  const landing = await startLanding({
    port,
    store,
    discordWebhookUrl: process.env.DISCORD_WAITLIST_WEBHOOK,
  });
  console.info(`Landing up on http://127.0.0.1:${landing.port}`);
}

void main();

/**
 * P4.36 — Discord webhook helper.
 *
 * Why not discord.js? It pulls ~10 MB of transitive deps and a
 * persistent gateway connection. For our use case (post a message to
 * a channel, occasionally embed-with-link) Discord's HTTP webhook
 * endpoint is a single POST. We use it directly.
 *
 * Create a webhook in the Discord channel → copy the URL → set as
 * DISCORD_*_WEBHOOK env var. No bot, no OAuth, no rate-limit
 * gymnastics for a few-posts-per-day cadence.
 *
 * Reference: https://discord.com/developers/docs/resources/webhook
 */

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordPost {
  content?: string;
  username?: string;
  /** Discord allows up to 10 embeds per message. */
  embeds?: DiscordEmbed[];
}

export interface PosterDeps {
  fetcher?: typeof fetch;
}

export interface PostResult {
  ok: boolean;
  status: number;
  message?: string;
}

export class DiscordPoster {
  constructor(
    private readonly webhookUrl: string,
    private readonly deps: PosterDeps = {}
  ) {}

  async post(payload: DiscordPost): Promise<PostResult> {
    if (!this.webhookUrl) {
      return { ok: false, status: 0, message: 'no webhook url' };
    }
    const fetcher = this.deps.fetcher ?? fetch;
    try {
      const res = await fetcher(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        message: err instanceof Error ? err.message : 'fetch failed',
      };
    }
  }

  /** Convenience: just a content-only message. */
  message(content: string): Promise<PostResult> {
    return this.post({ content });
  }
}

/**
 * Hardcoded welcome message template — used by the channel-create
 * script (P4.36-setup) to seed #welcome and #rules. Owner edits
 * over time; keeping it as a constant makes it reviewable in PRs.
 */
export const WELCOME_TEMPLATE = `**Welcome to the DirectorAI beta** 👋

Quick orientation:

• **#announcements** — release notes, downtime, calls for testing.
• **#bugs** — anything that doesn't behave; one issue per thread please.
• **#styles** — share your \`.style\` YAML files; remix what others share.
• **#feedback** — wishlist, papercuts, "why is X like that".
• **#voice** — community calls (announced ahead of time).

If you're new to UXP, start with the **Getting Started** video on docs.directorai.app.
Welcome!`;

/**
 * Channel structure — fed into the seed-channels script (owner-completed).
 * Documents intent so the layout is reviewable in git.
 */
export const CHANNEL_LAYOUT: readonly { category: string; channels: readonly string[] }[] = [
  { category: 'Onboarding', channels: ['welcome', 'rules', 'introductions'] },
  { category: 'Updates', channels: ['announcements', 'changelog', 'voice'] },
  { category: 'Help', channels: ['bugs', 'how-do-i', 'feature-requests'] },
  { category: 'Creator', channels: ['styles', 'cuts-of-the-week', 'showcase'] },
  { category: 'Meta', channels: ['feedback', 'off-topic'] },
];

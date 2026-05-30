/**
 * P4.39 — Marketing site pages.
 *
 * Inline HTML for the production site (directorai.app). Six pages:
 *
 *   /          home
 *   /pricing   pricing table + comparison
 *   /how       how-it-works deep-dive
 *   /faq       common questions
 *   /changelog auto-rendered from CHANGELOG entries
 *   /press     press kit landing
 *
 * Shared shell (nav, footer) wraps each page. Inline CSS keeps the
 * deploy footprint to one Node binary, same approach as
 * apps/landing.
 *
 * Anything dynamic (waitlist, purchase, license activate) lives on
 * apps/landing / apps/portal / Stripe — this app is content-only.
 */

const SHELL_CSS = `
  :root { --fg:#111; --muted:#5a5a5a; --bg:#fff; --soft:#f7f8fa; --accent:#4c8bf5; --border:#e5e5e5; }
  @media (prefers-color-scheme: dark) {
    :root { --fg:#eee; --muted:#aaa; --bg:#0f0f10; --soft:#161618; --border:#2a2a2c; }
  }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color:var(--fg); background:var(--bg); }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  header.site { display:flex; align-items:center; padding:14px 28px; border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--bg); z-index:10; }
  header.site .brand { font-weight:700; font-size:18px; margin-right:auto; }
  header.site nav a { margin-left:18px; font-size:14px; color:var(--muted); }
  header.site nav a:hover { color:var(--fg); text-decoration:none; }
  header.site .cta { margin-left:18px; padding:6px 14px; background:var(--accent); color:#fff; border-radius:5px; font-size:13px; }
  header.site .cta:hover { text-decoration:none; opacity:.92; }
  main { max-width:960px; margin:0 auto; padding:48px 28px; }
  section.band { background:var(--soft); }
  section.band > .inner { max-width:960px; margin:0 auto; padding:48px 28px; }
  h1 { font-size:42px; line-height:1.1; margin:0 0 14px; }
  h2 { font-size:26px; margin:48px 0 12px; }
  h3 { font-size:18px; margin:20px 0 8px; }
  p.lead { font-size:18px; color:var(--muted); }
  table.compare { width:100%; border-collapse:collapse; margin-top:16px; }
  table.compare th, table.compare td { padding:10px 12px; border-bottom:1px solid var(--border); text-align:left; font-size:14px; }
  table.compare th { font-weight:600; }
  table.compare td.x { color:#c44; }
  table.compare td.check { color:#3a7d44; font-weight:600; }
  .price-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:18px; margin-top:24px; }
  .plan { border:1px solid var(--border); border-radius:8px; padding:24px; }
  .plan.featured { border-color:var(--accent); }
  .plan .name { font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); }
  .plan .price { font-size:32px; margin:8px 0; }
  .plan .price small { font-size:14px; color:var(--muted); font-weight:normal; }
  .plan ul { list-style:none; padding:0; margin:12px 0 18px; }
  .plan ul li { font-size:13px; color:var(--muted); padding:4px 0; }
  .plan a.cta { display:inline-block; padding:8px 16px; background:var(--accent); color:#fff; border-radius:5px; font-size:13px; }
  .feat-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:24px; margin-top:24px; }
  .feat h3 { margin-top:0; }
  .faq dt { font-weight:600; margin-top:18px; }
  .faq dd { margin:6px 0 0; color:var(--muted); }
  footer.site { padding:32px 28px; border-top:1px solid var(--border); color:var(--muted); font-size:13px; }
  footer.site .cols { display:flex; flex-wrap:wrap; gap:32px; max-width:960px; margin:0 auto; }
  footer.site .cols > div { flex:1 1 160px; }
  footer.site h4 { font-size:12px; color:var(--fg); text-transform:uppercase; letter-spacing:1px; margin:0 0 8px; }
  footer.site a { display:block; color:var(--muted); padding:2px 0; }
  hr.sep { border:0; border-top:1px solid var(--border); margin:32px 0; }
  .hero { text-align:center; padding-top:64px; }
`;

function shell(title: string, body: string, descr?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${descr ?? 'DirectorAI — AI Editing Copilot for Adobe Premiere Pro.'}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${descr ?? 'AI Editing Copilot for Adobe Premiere Pro.'}">
  <meta property="og:type" content="website">
  <link rel="alternate" type="application/rss+xml" href="/changelog/rss" title="DirectorAI changelog">
  <style>${SHELL_CSS}</style>
</head>
<body>
  <header class="site">
    <div class="brand"><a href="/" style="color:inherit;">DirectorAI</a></div>
    <nav>
      <a href="/how">How it works</a>
      <a href="/pricing">Pricing</a>
      <a href="/faq">FAQ</a>
      <a href="/changelog">Changelog</a>
      <a href="https://docs.directorai.app">Docs</a>
    </nav>
    <a class="cta" href="https://beta.directorai.app">Try the beta</a>
  </header>
  ${body}
  <footer class="site">
    <div class="cols">
      <div>
        <h4>Product</h4>
        <a href="/">Home</a>
        <a href="/how">How it works</a>
        <a href="/pricing">Pricing</a>
        <a href="/changelog">Changelog</a>
      </div>
      <div>
        <h4>Resources</h4>
        <a href="https://docs.directorai.app">Documentation</a>
        <a href="https://docs.directorai.app/tutorials/01-getting-started.html">Tutorials</a>
        <a href="/press">Press kit</a>
        <a href="https://github.com/directorai">GitHub</a>
      </div>
      <div>
        <h4>Community</h4>
        <a href="https://discord.gg/directorai">Discord</a>
        <a href="https://twitter.com/directorai">Twitter / X</a>
        <a href="mailto:hello@directorai.app">hello@directorai.app</a>
      </div>
      <div>
        <h4>Legal</h4>
        <a href="https://beta.directorai.app/privacy">Privacy</a>
        <a href="https://beta.directorai.app/terms">Terms</a>
        <a href="mailto:legal@directorai.app">DPA</a>
      </div>
    </div>
    <hr class="sep">
    <div style="text-align:center;">© ${new Date().getFullYear()} DirectorAI · Built with Premiere Pro in mind.</div>
  </footer>
</body>
</html>`;
}

const HERO = `
<section class="hero">
  <main>
    <h1>Edit at the speed of thought.</h1>
    <p class="lead">DirectorAI watches your edits, learns your style, then drafts rough cuts inside Adobe Premiere Pro. Beats, scenes, transcript, color — all stitched into one pass.</p>
    <p><a class="cta" style="padding:12px 28px; font-size:15px; background:var(--accent); color:#fff; border-radius:6px;" href="https://beta.directorai.app">Request beta access</a></p>
    <p style="color:var(--muted); margin-top:12px; font-size:13px;">Windows · Premiere Pro 2024+ · Closed beta until v1.0</p>
  </main>
</section>
<section class="band">
  <div class="inner">
    <h2 style="margin-top:0;">Built different</h2>
    <p class="lead">Most AI editors do one thing — talking-head trims. DirectorAI handles the whole cut.</p>
    <table class="compare">
      <thead><tr><th></th><th>AutoEdit / AutoCut</th><th>DirectorAI</th></tr></thead>
      <tbody>
        <tr><td>Trim silences + fillers</td><td class="check">✔</td><td class="check">✔</td></tr>
        <tr><td>Beat-snapped cuts</td><td class="x">✘</td><td class="check">✔</td></tr>
        <tr><td>Style YAML, not just presets</td><td class="x">✘</td><td class="check">✔</td></tr>
        <tr><td>Learns your edits over time</td><td class="x">✘</td><td class="check">✔</td></tr>
        <tr><td>Semantic context search</td><td class="x">✘</td><td class="check">✔</td></tr>
        <tr><td>Runs locally — media never uploads</td><td class="x">✘</td><td class="check">✔</td></tr>
        <tr><td>Single-Ctrl-Z to revert a full apply</td><td class="x">✘</td><td class="check">✔</td></tr>
      </tbody>
    </table>
  </div>
</section>
<main>
  <h2>Four pillars</h2>
  <div class="feat-grid">
    <div class="feat"><h3>Style Engine moat</h3><p>Author YAML once, or learn from your edits. The cut planner emits a deterministic plan; the LLM only refines.</p></div>
    <div class="feat"><h3>Local context engine</h3><p>Whisper for transcribe, PySceneDetect for scenes, librosa for beats, Claude Vision for shots. All on your machine.</p></div>
    <div class="feat"><h3>Reliable + cancellable</h3><p>Plans run inside one undo group; one Ctrl-Z reverts. Cancel button always available; checkpoints survive crashes.</p></div>
    <div class="feat"><h3>Inside your Premiere</h3><p>UXP panel — same window, same shortcuts. No file roundtrips, no XML export dance.</p></div>
  </div>
  <p style="text-align:center; margin-top:48px;"><a class="cta" style="padding:10px 22px; background:var(--accent); color:#fff; border-radius:6px;" href="https://beta.directorai.app">Get on the beta list →</a></p>
</main>
`;

const HOW_BODY = `
<main>
  <h1>How DirectorAI cuts your footage</h1>
  <p class="lead">DirectorAI isn't "an AI cuts your video". It's a deterministic plan, optionally refined by an LLM, executed inside your project's undo group.</p>
  <h2>1. Context engine — what's in the footage</h2>
  <p>A local Python sidecar runs Whisper (transcribe), PySceneDetect (cuts between shots), librosa (audio beats), and Claude Vision (visual descriptions). Output is a JSON <code>MediaContext</code> that lives next to your clip.</p>
  <h2>2. Cut planner — what to do about it</h2>
  <p>Given a Style + a MediaContext, the planner emits a deterministic <code>Plan</code> of tool calls. Same input → same output, every time. Easy to dry-run, diff, share.</p>
  <h2>3. LLM refiner — optional polish</h2>
  <p>If you've set <code>ANTHROPIC_API_KEY</code>, Claude gets a pass at the rule-based plan: reorder, drop, add steps. Falls back to rules-only without a key. You see both versions before applying.</p>
  <h2>4. Executor — inside your Premiere</h2>
  <p>The plan walks against the real Premiere adapter (UXP) inside one <code>beginUndoGroup</code> / <code>endUndoGroup</code> pair. Single Ctrl-Z reverts everything. Each step shows progress; cancel works at any time.</p>
  <h2>5. Style learner — gets better</h2>
  <p>When you tweak the output, the learner diffs your edits against the plan. After two matching corrections it derives a <code>StylePatch</code> — applied next run, with your approval.</p>
  <p style="text-align:center; margin-top:48px;"><a class="cta" style="padding:10px 22px; background:var(--accent); color:#fff; border-radius:6px;" href="https://docs.directorai.app/architecture/overview.html">Read the architecture →</a></p>
</main>`;

const PRICING_BODY = `
<main>
  <h1>Pricing</h1>
  <p class="lead">One-time licenses include 1–2 years of free updates. Subscription unlocks the upcoming style marketplace.</p>
  <div class="price-grid">
    <div class="plan">
      <div class="name">Basic</div>
      <div class="price">$9.99 <small>one-time</small></div>
      <ul>
        <li>5 built-in styles</li>
        <li>Local context engine</li>
        <li>1 year free updates</li>
        <li>Community support</li>
      </ul>
      <a class="cta" href="https://beta.directorai.app">Join beta</a>
    </div>
    <div class="plan featured">
      <div class="name">Pro · most popular</div>
      <div class="price">$109 <small>one-time</small></div>
      <ul>
        <li>Everything in Basic</li>
        <li>Style Learner</li>
        <li>Custom YAML + sharing</li>
        <li>2 years free updates</li>
        <li>Email support</li>
      </ul>
      <a class="cta" href="https://beta.directorai.app">Join beta</a>
    </div>
    <div class="plan">
      <div class="name">Subscription</div>
      <div class="price">$19 <small>/ month</small></div>
      <ul>
        <li>Everything in Pro</li>
        <li>Marketplace access (coming P5)</li>
        <li>Priority support</li>
        <li>Cancel anytime</li>
      </ul>
      <a class="cta" href="https://beta.directorai.app">Join beta</a>
    </div>
  </div>
  <hr class="sep">
  <h2>What every plan includes</h2>
  <ul style="color:var(--muted); font-size:14px;">
    <li>Local-only context engine — your media never uploads.</li>
    <li>Open <code>.style</code> format — your styles are yours.</li>
    <li>Offline 7-day grace — flights, conferences, off-grid edits.</li>
    <li>30-day refund, no questions.</li>
  </ul>
</main>`;

const FAQ_BODY = `
<main>
  <h1>FAQ</h1>
  <dl class="faq">
    <dt>Does my footage leave my machine?</dt>
    <dd>No. Transcribe, scene detection, beats, and color all run in the local Python sidecar. Only the LLM refiner (optional) sends a JSON plan summary to Claude — never media.</dd>

    <dt>Will it work with my existing Premiere project?</dt>
    <dd>Yes. DirectorAI runs as a Window → Extensions panel inside Premiere Pro 2024+. Open any project, click Apply, undo with Ctrl-Z if you don't like the cut.</dd>

    <dt>Mac support?</dt>
    <dd>Not in v1.0 — Windows-first while we get the installer story right. macOS DMG is on the P5 roadmap.</dd>

    <dt>Can I write my own style?</dt>
    <dd>Pro + Subscription plans get the custom YAML editor + .style export/import. Built-in styles cover talking-head, vlog, podcast, cinematic, tech-reel out of the box.</dd>

    <dt>How does the Style Learner actually work?</dt>
    <dd>It snapshots the sequence before each Apply, diffs against your manual tweaks after, and after two matching patterns proposes a derived style. You approve before it sticks.</dd>

    <dt>What happens if Premiere crashes mid-plan?</dt>
    <dd>The panel checkpoints before every Apply. On reconnect you'll see a "recovered from checkpoint" banner. Single Ctrl-Z still reverts the partial apply since plans run in one undo group.</dd>

    <dt>How do I cancel a subscription?</dt>
    <dd>From your account page (portal.directorai.app) or by emailing hello@directorai.app. Your license stays valid through the current period.</dd>

    <dt>Is there an API / SDK?</dt>
    <dd>The MCP server speaks the standard Anthropic Model Context Protocol, so anything that speaks MCP can drive Premiere through it. A public SDK is part of P5.</dd>
  </dl>
  <p style="margin-top:48px; text-align:center;">Other questions? <a href="mailto:hello@directorai.app">Email us</a> or drop into <a href="https://discord.gg/directorai">Discord</a>.</p>
</main>`;

const CHANGELOG_BODY = `
<main>
  <h1>Changelog</h1>
  <p class="lead">What shipped, when, and why it matters. Subscribe via <a href="/changelog/rss">RSS</a>.</p>

  <h2>v1.0.0 — Public launch</h2>
  <p style="color:var(--muted);">Today</p>
  <ul>
    <li>Stripe live mode, marketing site, press kit, launch runbook.</li>
    <li>Closed beta opens to public.</li>
  </ul>

  <h2>v0.9.0-beta — Beta program</h2>
  <ul>
    <li>Landing page + waitlist (apps/landing).</li>
    <li>Discord webhook integration + weekly survey loop.</li>
    <li>Issue templates + auto-triage workflow.</li>
  </ul>

  <h2>v0.8.0-onboarded — Docs + onboarding</h2>
  <ul>
    <li>docs.directorai.app live (custom SSG + TypeDoc API ref).</li>
    <li>First-run wizard + onboarding tour.</li>
    <li>Sample project (hello-vlog) + 5 tutorial scripts.</li>
  </ul>

  <h2>v0.7.0-installable — Distribution</h2>
  <ul>
    <li>Ed25519 license format + Stripe webhook + email delivery.</li>
    <li>Windows MSI installer (WiX 5), Python sidecar bootstrap.</li>
    <li>Auto-updater with SHA-256 verified feed.</li>
  </ul>

  <h2>v0.6.0-observable — Observability + perf</h2>
  <ul>
    <li>Sentry server + panel; source-map upload.</li>
    <li>Opt-in telemetry (20 events, GDPR delete RPC).</li>
    <li>ReadCache (TTL + LRU), code-split panel.</li>
  </ul>

  <h2>v0.5.0-reliable — Reliability</h2>
  <ul>
    <li>Progress bus + AbortSignal-driven cancel.</li>
    <li>WebSocket reconnect state machine + pong watchdog.</li>
    <li>Checkpoint store + panel recovery banner.</li>
    <li>Chaos test suite.</li>
  </ul>

  <h2>Earlier</h2>
  <p style="color:var(--muted);">See the full history on <a href="https://github.com/directorai">GitHub</a> or the ADR index at <a href="https://docs.directorai.app/adr/">docs.directorai.app/adr</a>.</p>
</main>`;

const PRESS_LANDING_BODY = `
<main>
  <h1>Press kit</h1>
  <p class="lead">Writing about DirectorAI? Take what you need from <code>press/</code> on GitHub, or grab the highlights below.</p>
  <ul>
    <li><a href="https://github.com/directorai/directorai/tree/main/press">Full press kit folder</a></li>
    <li><a href="https://github.com/directorai/directorai/blob/main/press/fact-sheet.md">Fact sheet (one-pager)</a></li>
    <li><a href="https://github.com/directorai/directorai/blob/main/press/copy-blocks.md">Pre-written copy blocks</a></li>
    <li><a href="https://github.com/directorai/directorai/blob/main/press/journalist-faq.md">Journalist FAQ</a></li>
  </ul>
  <p>Need a quote, a screenshot, or a demo build? Email <a href="mailto:press@directorai.app">press@directorai.app</a>.</p>
</main>`;

export const PAGES: Record<string, string> = {
  '/': shell('DirectorAI — AI Editing Copilot for Premiere Pro', HERO),
  '/how': shell('How DirectorAI works', HOW_BODY),
  '/pricing': shell('DirectorAI pricing', PRICING_BODY),
  '/faq': shell('DirectorAI — FAQ', FAQ_BODY),
  '/changelog': shell('DirectorAI changelog', CHANGELOG_BODY),
  '/press': shell('DirectorAI press kit', PRESS_LANDING_BODY),
};

export const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.keys(PAGES)
  .map((p) => `  <url><loc>https://directorai.app${p}</loc><changefreq>weekly</changefreq></url>`)
  .join('\n')}
</urlset>`;

export const ROBOTS_TXT = `User-agent: *
Allow: /
Sitemap: https://directorai.app/sitemap.xml
`;

export const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>DirectorAI changelog</title>
<link>https://directorai.app/changelog</link>
<description>Release notes for DirectorAI.</description>
<item>
  <title>v1.0.0 — Public launch</title>
  <link>https://directorai.app/changelog#v1.0.0</link>
  <description>Marketing site live, Stripe live mode, public beta opens.</description>
</item>
<item>
  <title>v0.9.0-beta — Beta program</title>
  <link>https://directorai.app/changelog#v0.9.0-beta</link>
  <description>Landing page, Discord integration, weekly survey, issue triage.</description>
</item>
</channel>
</rss>`;

/**
 * P4.35 — Static landing page HTML.
 *
 * Kept inline (no React, no template engine) so the landing app is
 * one Node binary with zero front-end build step. Inline CSS is
 * scoped + dark-mode-aware via prefers-color-scheme.
 */

export const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DirectorAI — AI Editing Copilot for Premiere Pro</title>
  <meta name="description" content="DirectorAI learns your editing style and produces rough cuts inside Adobe Premiere Pro. Closed beta — request access.">
  <meta property="og:title" content="DirectorAI">
  <meta property="og:description" content="AI Editing Copilot for Adobe Premiere Pro.">
  <style>
    :root { --fg:#1a1a1a; --muted:#5a5a5a; --bg:#fff; --accent:#4c8bf5; --border:#e5e5e5; --soft:#f7f8fa; }
    @media (prefers-color-scheme: dark) {
      :root { --fg:#eee; --muted:#aaa; --bg:#0f0f10; --border:#2a2a2c; --soft:#161618; }
    }
    * { box-sizing: border-box; }
    body { margin:0; font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color:var(--fg); background:var(--bg); }
    header, footer { padding:18px 32px; }
    header { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); }
    header .brand { font-weight:700; font-size:18px; }
    header nav a { color:var(--muted); text-decoration:none; margin-left:18px; font-size:14px; }
    header nav a:hover { color:var(--fg); }
    .hero { padding:80px 32px 60px; max-width:880px; margin:0 auto; text-align:center; }
    .hero h1 { font-size:44px; line-height:1.15; margin:0 0 16px; }
    .hero p.tagline { font-size:18px; color:var(--muted); margin:0 0 32px; }
    .hero .badge { display:inline-block; padding:4px 12px; border:1px solid var(--accent); color:var(--accent); border-radius:999px; font-size:12px; letter-spacing:1px; text-transform:uppercase; margin-bottom:24px; }
    form#waitlist { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
    form#waitlist input[type=email] { padding:12px 16px; border:1px solid var(--border); border-radius:6px; min-width:280px; background:var(--bg); color:var(--fg); font-size:14px; }
    form#waitlist button { padding:12px 22px; border:0; background:var(--accent); color:white; border-radius:6px; cursor:pointer; font-size:14px; font-weight:600; }
    form#waitlist button:disabled { opacity:.5; cursor:not-allowed; }
    #signup-msg { margin-top:16px; font-size:13px; color:var(--muted); min-height:1em; }
    section.features { background:var(--soft); padding:60px 32px; }
    .features-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:24px; max-width:1000px; margin:0 auto; }
    .feature h3 { font-size:16px; margin:0 0 6px; }
    .feature p { color:var(--muted); margin:0; font-size:14px; }
    section.pricing { padding:60px 32px; max-width:880px; margin:0 auto; }
    .price-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:18px; margin-top:24px; }
    .plan { border:1px solid var(--border); border-radius:8px; padding:24px; }
    .plan.featured { border-color:var(--accent); }
    .plan .name { font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); }
    .plan .price { font-size:32px; margin:8px 0; }
    .plan ul { list-style:none; padding:0; margin:12px 0 0; }
    .plan ul li { font-size:13px; color:var(--muted); padding:4px 0; }
    footer { color:var(--muted); font-size:12px; border-top:1px solid var(--border); display:flex; justify-content:space-between; }
    footer a { color:var(--muted); text-decoration:none; margin-left:16px; }
    footer a:hover { color:var(--fg); }
  </style>
</head>
<body>
  <header>
    <div class="brand">DirectorAI</div>
    <nav>
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a href="https://github.com/directorai" target="_blank" rel="noopener">GitHub</a>
    </nav>
  </header>

  <section class="hero">
    <div class="badge">Closed Beta</div>
    <h1>Edit at the speed of thought.</h1>
    <p class="tagline">DirectorAI learns your editing style and produces rough cuts inside Adobe Premiere Pro — talking-head, vlog, podcast, cinematic. Style learning is the moat.</p>
    <form id="waitlist" onsubmit="return signup(event)">
      <input type="email" name="email" required placeholder="you@studio.com" autocomplete="email">
      <button type="submit" id="signup-btn">Request beta access</button>
    </form>
    <div id="signup-msg" role="status"></div>
  </section>

  <section class="features" id="features">
    <div class="features-grid">
      <div class="feature"><h3>Style Engine moat</h3><p>Watches your manual edits, extracts patterns, applies them next run. Vlog, talking-head, cinematic — out of the box, plus your own.</p></div>
      <div class="feature"><h3>Context-aware cuts</h3><p>Whisper transcript, PySceneDetect scenes, librosa beats, Claude Vision. The plan knows which line of dialog matters.</p></div>
      <div class="feature"><h3>Deterministic + cancellable</h3><p>Every plan is reproducible. Long ops show progress and a Cancel button. Single Ctrl-Z undoes the whole apply.</p></div>
      <div class="feature"><h3>Runs in your Premiere</h3><p>UXP panel inside Premiere Pro 2024+ on Windows. Local sidecars for Whisper and vision; your media never leaves the machine.</p></div>
    </div>
  </section>

  <section class="pricing" id="pricing">
    <h2 style="text-align:center;">Pricing</h2>
    <p style="text-align:center; color:var(--muted);">One-time licenses come with 1–2 years of updates. Subscription unlocks the marketplace.</p>
    <div class="price-grid">
      <div class="plan"><div class="name">Basic</div><div class="price">$9.99</div><ul><li>Built-in styles</li><li>Local context engine</li><li>1 year updates</li></ul></div>
      <div class="plan featured"><div class="name">Pro</div><div class="price">$109</div><ul><li>Everything in Basic</li><li>Style Learner</li><li>Custom YAML</li><li>2 years updates</li></ul></div>
      <div class="plan"><div class="name">Subscription</div><div class="price">$19/mo</div><ul><li>Everything in Pro</li><li>Marketplace access</li><li>Priority support</li></ul></div>
    </div>
  </section>

  <footer>
    <div>© DirectorAI — beta software, expect rough edges.</div>
    <nav>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="mailto:hello@directorai.app">Contact</a>
    </nav>
  </footer>

  <script>
    async function signup(e){
      e.preventDefault();
      const btn = document.getElementById('signup-btn');
      const msg = document.getElementById('signup-msg');
      const email = e.target.email.value.trim();
      btn.disabled = true;
      msg.textContent = '…';
      try {
        const r = await fetch('/api/waitlist', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email })
        });
        const out = await r.json();
        msg.textContent = r.ok ? 'You\\u2019re on the list. We\\u2019ll email you when slots open.' : (out.error || 'Sign-up failed.');
      } catch (err) {
        msg.textContent = 'Network error \\u2014 try again later.';
      } finally {
        btn.disabled = false;
      }
      return false;
    }
  </script>
</body>
</html>`;

export const PRIVACY_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Privacy — DirectorAI</title></head><body style="font:14px/1.6 system-ui; max-width:640px; margin:60px auto; padding:0 20px;">
<h1>Privacy policy (draft)</h1>
<p>This is a placeholder. The real privacy policy ships before public launch (P4.04 + legal review).</p>
<p>What we collect today: only what you opt into in the panel's Telemetry consent dialog. No media, no transcripts, no PII.</p>
<p>What we collect on this landing page: your email address (waitlist only). One automated welcome mail, then optionally a launch announcement. You can email <a href="mailto:hello@directorai.app">hello@directorai.app</a> to be removed.</p>
<p><a href="/">← back to home</a></p>
</body></html>`;

export const TERMS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Terms — DirectorAI</title></head><body style="font:14px/1.6 system-ui; max-width:640px; margin:60px auto; padding:0 20px;">
<h1>Terms of service (draft)</h1>
<p>This is a placeholder. Beta is provided as-is, no warranty. License terms ship with each purchase. Real terms before public launch (P4.05 + legal review).</p>
<p><a href="/">← back to home</a></p>
</body></html>`;

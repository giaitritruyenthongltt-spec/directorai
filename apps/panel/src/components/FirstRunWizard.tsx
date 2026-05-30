/**
 * P4.31 — First-run wizard.
 *
 * Four-step modal that appears the first time the panel boots
 * (detected via `firstRun.status` RPC — see below). Each step exits
 * to the next on user action. Telemetry consent (P4.13) is folded
 * in as step 4 so the user only sees one onboarding flow.
 *
 *   Step 1 — Verify Premiere + UXP connection.
 *   Step 2 — Anthropic API key (optional, paste-and-store on server).
 *   Step 3 — Download the sample project (link to samples bundle).
 *   Step 4 — Telemetry opt-in.
 *
 * The server-side `firstRun.markDone` RPC writes
 * `~/.directorai/first-run.done` so the wizard never reappears.
 */
import React, { useEffect, useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import './FirstRunWizard.css';

type Step = 1 | 2 | 3 | 4 | 'done';

interface FirstRunStatus {
  done: boolean;
}

interface ConsentRecord {
  installId: string;
  consented: boolean | null;
}

export function FirstRunWizard(): React.ReactElement | null {
  const [step, setStep] = useState<Step>(1);
  const [active, setActive] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = wsClient.onStateChange((s) => {
      if (s !== 'connected') return;
      void wsClient
        .call<FirstRunStatus>('firstRun.status')
        .then((res) => setActive(!res.done))
        .catch(() => setActive(false));
    });
    return unsub;
  }, []);

  if (!active || step === 'done') return null;

  const next = (): void => {
    setStep((s) => {
      if (s === 'done' || s === 4) return 'done';
      return (s + 1) as Step;
    });
  };

  const finish = async (): Promise<void> => {
    setBusy(true);
    try {
      await wsClient.call('firstRun.markDone');
      setActive(false);
    } finally {
      setBusy(false);
    }
  };

  const saveApiKey = async (): Promise<void> => {
    if (!apiKey.trim()) {
      next();
      return;
    }
    setBusy(true);
    try {
      await wsClient.call('firstRun.setApiKey', { key: apiKey.trim() });
      next();
    } finally {
      setBusy(false);
    }
  };

  const setConsent = async (value: boolean): Promise<void> => {
    setBusy(true);
    try {
      await wsClient.call<ConsentRecord>('telemetry.consent.set', { value });
    } finally {
      setBusy(false);
      await finish();
    }
  };

  return (
    <div className="wiz-overlay" role="dialog" aria-modal="true">
      <div className="wiz-card">
        <div className="wiz-step-dots">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`wiz-dot ${step >= n ? 'on' : ''}`} />
          ))}
        </div>

        {step === 1 && (
          <>
            <h3>Step 1 — Connect to Premiere</h3>
            <p>
              We&apos;ve detected your panel is talking to the DirectorAI server. If you don&apos;t
              see your Premiere project in the Status bar, load this plugin via the Adobe UXP
              Developer Tool. See <strong>docs/guides/uxp-setup.md</strong>.
            </p>
            <div className="wiz-actions">
              <button type="button" className="wiz-btn" onClick={next}>
                Next
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3>Step 2 — Anthropic API key (optional)</h3>
            <p>
              The natural-language command bar needs a Claude API key. You can skip this and add the
              key later from settings; built-in shortcuts work without it.
            </p>
            <input
              type="password"
              className="wiz-input"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="wiz-actions">
              <button
                type="button"
                className="wiz-btn wiz-secondary"
                onClick={next}
                disabled={busy}
              >
                Skip
              </button>
              <button
                type="button"
                className="wiz-btn"
                onClick={() => void saveApiKey()}
                disabled={busy}
              >
                Save key
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3>Step 3 — Try the sample project</h3>
            <p>
              We&apos;ve bundled a 30-second sample vlog so you can see DirectorAI work without
              needing your own footage yet. Open it in Premiere, then come back to the
              <em> Style</em> tab and click <em>Apply</em> to see the cut planner in action.
            </p>
            <pre className="wiz-pre">samples/hello-vlog/</pre>
            <div className="wiz-actions">
              <button type="button" className="wiz-btn" onClick={next}>
                Got it
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h3>Step 4 — Help us improve</h3>
            <p>
              We&apos;d like to collect <strong>anonymous usage</strong> — tool names, durations,
              error classes. <em>No media, transcripts, or PII.</em> You can change this any time
              from Settings → Privacy.
            </p>
            <div className="wiz-actions">
              <button
                type="button"
                className="wiz-btn wiz-secondary"
                onClick={() => void setConsent(false)}
                disabled={busy}
              >
                No thanks
              </button>
              <button
                type="button"
                className="wiz-btn"
                onClick={() => void setConsent(true)}
                disabled={busy}
              >
                Allow telemetry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

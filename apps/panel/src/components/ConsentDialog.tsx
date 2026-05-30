/**
 * P4.13 — Telemetry consent dialog.
 *
 * Shown when the server reports `consented === null` (never asked).
 * Three actions:
 *   - Allow → telemetry.consent.set { value: true }
 *   - Decline → telemetry.consent.set { value: false }
 *   - Delete my data (only visible if previously opted in) → telemetry.delete
 *
 * Mounted at the root of App; renders nothing once the user has answered.
 */
import React, { useEffect, useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import './ConsentDialog.css';

interface ConsentRecord {
  installId: string;
  consented: boolean | null;
  consentedAt: number | null;
  deletedAt: number | null;
}

export function ConsentDialog(): React.ReactElement | null {
  const [record, setRecord] = useState<ConsentRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = wsClient.onStateChange((s) => {
      if (s !== 'connected') return;
      void wsClient
        .call<ConsentRecord>('telemetry.consent.get')
        .then(setRecord)
        .catch(() => setRecord(null));
    });
    return unsub;
  }, []);

  if (!record || record.consented !== null) return null;

  const set = async (value: boolean): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await wsClient.call<ConsentRecord>('telemetry.consent.set', { value });
      setRecord(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="consent-overlay" role="dialog" aria-modal="true">
      <div className="consent-card">
        <h3>Help improve DirectorAI</h3>
        <p>
          We collect <strong>anonymous usage data</strong> — tool names, durations, and error
          classes only. <em>No media, no transcripts, no PII</em> ever leaves your machine.
        </p>
        <p className="consent-link">
          You can change your mind any time from the status bar, or wipe stored events from Settings
          → Privacy. The full event catalog is in our docs.
        </p>
        <div className="consent-actions">
          <button
            type="button"
            onClick={() => void set(false)}
            disabled={busy}
            className="consent-btn consent-secondary"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => void set(true)}
            disabled={busy}
            className="consent-btn consent-primary"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

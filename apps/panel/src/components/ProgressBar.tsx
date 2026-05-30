/**
 * P4.04 — Progress bar + cancel button for inflight server ops.
 *
 * Subscribes to wsClient.onProgress and tracks the most recent
 * unfinished op. Shows method name, optional label, percent (if total
 * supplied), and a Cancel button that calls `wsClient.cancelOp(opId)`.
 *
 * Renders nothing when there is no active op (zero-overhead idle).
 */
import React, { useEffect, useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import type { ProgressEvent, ProgressStart, ProgressUpdate } from '@directorai/shared';
import './ProgressBar.css';

interface ActiveOp {
  readonly opId: string;
  readonly method: string;
  readonly total?: number;
  readonly done: number;
  readonly label?: string;
}

function reduceEvent(prev: ActiveOp | null, evt: ProgressEvent): ActiveOp | null {
  switch (evt.kind) {
    case 'start': {
      const start = evt as ProgressStart;
      return { opId: start.opId, method: start.method, total: start.total, done: 0 };
    }
    case 'update': {
      if (!prev || prev.opId !== evt.opId) return prev;
      const update = evt as ProgressUpdate;
      return {
        ...prev,
        done: update.done,
        total: update.total ?? prev.total,
        label: update.label ?? prev.label,
      };
    }
    case 'end': {
      if (!prev || prev.opId !== evt.opId) return prev;
      return null;
    }
  }
}

export function ProgressBar(): React.ReactElement | null {
  const [op, setOp] = useState<ActiveOp | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const unsub = wsClient.onProgress((evt) => {
      setOp((prev) => reduceEvent(prev, evt));
    });
    return unsub;
  }, []);

  if (!op) return null;

  const pct =
    op.total && op.total > 0 ? Math.min(100, Math.round((op.done / op.total) * 100)) : null;

  const onCancel = async (): Promise<void> => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await wsClient.cancelOp(op.opId);
    } catch {
      // Surface as a label tweak — full error handling lives in chat log.
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="progress-bar">
      <div className="progress-meta">
        <span className="progress-method">{op.method}</span>
        {op.label && <span className="progress-label">{op.label}</span>}
        <span className="progress-pct">{pct !== null ? `${pct}%` : `${op.done}`}</span>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill ${pct === null ? 'indeterminate' : ''}`}
          style={pct !== null ? { width: `${pct}%` } : undefined}
        />
      </div>
      <button
        type="button"
        className="progress-cancel"
        onClick={() => void onCancel()}
        disabled={cancelling}
        aria-label="Cancel operation"
      >
        {cancelling ? '…' : 'Cancel'}
      </button>
    </div>
  );
}

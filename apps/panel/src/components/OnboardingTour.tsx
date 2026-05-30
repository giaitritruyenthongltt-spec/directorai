/**
 * P4.33 — In-app onboarding tour.
 *
 * Five-step tour highlighting the main panel features. Activated by
 * the first-run wizard (via `localStorage.directorai_tour_seen`) or
 * manually from settings. No external lib (react-joyride pulls 150 KB);
 * we use a positioned overlay + CSS-only highlight ring.
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import './OnboardingTour.css';

interface TourStep {
  /** CSS selector of the element to highlight. */
  target: string;
  title: string;
  body: string;
  /** Preferred placement; falls back to "bottom" if not enough room. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: TourStep[] = [
  {
    target: '.tabs',
    title: 'Three workspaces',
    body: 'Chat is your natural-language command bar. Style is the cut planner. Context indexes your footage for semantic search.',
    placement: 'bottom',
  },
  {
    target: '.command-bar',
    title: 'Talk to your timeline',
    body: 'Type plain English: "cut the silent parts" or "find the bit about Premiere and zoom on it". Built-in shortcuts skip the LLM.',
    placement: 'top',
  },
  {
    target: '[class*="StylePicker"], .tab-btn:nth-child(2)',
    title: 'Style tab — the moat',
    body: 'Pick a built-in style, write your own YAML, then Dry-run or Apply. Every Apply is checkpointed so a single Ctrl-Z reverts everything.',
    placement: 'bottom',
  },
  {
    target: '[class*="ContextTab"], .tab-btn:nth-child(3)',
    title: 'Context — search your footage',
    body: 'Ingest a clip and DirectorAI runs Whisper, scene detection, beats, vision. Then "find the part about X" returns a timecode.',
    placement: 'bottom',
  },
  {
    target: '.status-bar',
    title: 'Always-on status',
    body: 'Connection, project, sequence, and adapter mode (UXP / Mock) live here. Trust but verify.',
    placement: 'top',
  },
];

const SEEN_KEY = 'directorai_tour_seen_v1';

export interface OnboardingTourProps {
  /** When true, force the tour open regardless of localStorage. */
  force?: boolean;
  /** Called when the tour ends (skipped or completed). */
  onClose?: () => void;
}

export function OnboardingTour(props: OnboardingTourProps): React.ReactElement | null {
  const [stepIdx, setStepIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (props.force) {
      setOpen(true);
      setStepIdx(0);
      return;
    }
    try {
      const seen = window.localStorage.getItem(SEEN_KEY);
      if (!seen) {
        // Show after a beat so the panel has settled.
        const t = setTimeout(() => setOpen(true), 1_000);
        return () => clearTimeout(t);
      }
    } catch {
      /* localStorage unavailable in UXP test harness */
    }
    return;
  }, [props.force]);

  useLayoutEffect(() => {
    if (!open) return;
    const step = STEPS[stepIdx];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (el && 'getBoundingClientRect' in el) {
      setRect(el.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, [stepIdx, open]);

  if (!open) return null;
  const step = STEPS[stepIdx];
  if (!step) return null;

  const close = (): void => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    props.onClose?.();
  };

  const next = (): void => {
    if (stepIdx + 1 >= STEPS.length) close();
    else setStepIdx(stepIdx + 1);
  };
  const prev = (): void => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  // Compute popover position next to the highlight.
  const popStyle: React.CSSProperties = (() => {
    if (!rect) return { top: '40%', left: '50%', transform: 'translate(-50%, -50%)' };
    const pad = 12;
    switch (step.placement ?? 'bottom') {
      case 'top':
        return { top: rect.top - pad - 8, left: rect.left, transform: 'translate(0, -100%)' };
      case 'left':
        return { top: rect.top, left: rect.left - pad - 8, transform: 'translate(-100%, 0)' };
      case 'right':
        return { top: rect.top, left: rect.right + pad };
      case 'bottom':
      default:
        return { top: rect.bottom + pad, left: rect.left };
    }
  })();

  const ringStyle: React.CSSProperties = rect
    ? {
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      }
    : { display: 'none' };

  return (
    <div className="tour-overlay">
      <div className="tour-ring" style={ringStyle} />
      <div className="tour-popover" style={popStyle}>
        <div className="tour-step-count">
          {stepIdx + 1} / {STEPS.length}
        </div>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-btn-link" onClick={close}>
            Skip
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="tour-btn tour-secondary"
            onClick={prev}
            disabled={stepIdx === 0}
          >
            Back
          </button>
          <button type="button" className="tour-btn" onClick={next}>
            {stepIdx + 1 === STEPS.length ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

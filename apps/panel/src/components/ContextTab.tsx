/**
 * Context tab — drives the Python context-engine for the active media.
 *
 * UX:
 * - Health check on mount (context.health)
 * - Single field: media path; buttons: Ingest, Transcribe, Find Scenes,
 *   Find Beats, Analyze Visual, Search
 * - Compact result display in a JSON pane
 */

import React, { useEffect, useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import './ContextTab.css';

interface Health {
  status: string;
  version: string;
}

export function ContextTab(): React.ReactElement {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [mediaPath, setMediaPath] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const h = await wsClient.call<Health>('context.health');
        setHealth(h);
        setHealthErr(null);
      } catch (e) {
        setHealthErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const run = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(label);
    setError(null);
    setResult(null);
    try {
      setResult(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const callIngest = (): Promise<void> =>
    run('Ingesting', () =>
      wsClient.call('context.ingest', {
        media_path: mediaPath,
        enable_transcribe: true,
        enable_scene: true,
        enable_beat: false,
        enable_vision: false,
      })
    );
  const callTranscribe = (): Promise<void> =>
    run('Transcribing', () => wsClient.call('context.transcribe', { media_path: mediaPath }));
  const callScenes = (): Promise<void> =>
    run('Scene detect', () => wsClient.call('context.findScenes', { media_path: mediaPath }));
  const callBeats = (): Promise<void> =>
    run('Beats', () => wsClient.call('context.findBeats', { media_path: mediaPath }));
  const callVisual = (): Promise<void> =>
    run('Vision', () => wsClient.call('context.analyzeVisual', { media_path: mediaPath }));
  const callSearch = (): Promise<void> =>
    run('Searching', () => wsClient.call('context.searchClips', { query, top_k: 10 }));

  const canRun = mediaPath.trim().length > 0 && !busy;
  const canSearch = query.trim().length > 0 && !busy;

  return (
    <div className="context-tab">
      <header className="ctx-header">
        <h3>Context Engine</h3>
        {health ? (
          <span className="ctx-health ok">
            ✓ {health.status} · v{health.version}
          </span>
        ) : healthErr ? (
          <span className="ctx-health err">✗ unavailable: {healthErr}</span>
        ) : (
          <span className="ctx-health">checking…</span>
        )}
      </header>

      <section className="ctx-row">
        <label>Media path</label>
        <input
          type="text"
          placeholder="C:\Footage\hero.mp4"
          value={mediaPath}
          onChange={(e) => setMediaPath(e.target.value)}
        />
      </section>

      <section className="ctx-actions">
        <button disabled={!canRun} onClick={() => void callIngest()}>
          Ingest (all)
        </button>
        <button disabled={!canRun} onClick={() => void callTranscribe()}>
          Transcribe
        </button>
        <button disabled={!canRun} onClick={() => void callScenes()}>
          Find Scenes
        </button>
        <button disabled={!canRun} onClick={() => void callBeats()}>
          Find Beats
        </button>
        <button disabled={!canRun} onClick={() => void callVisual()}>
          Analyze Visual
        </button>
      </section>

      <section className="ctx-row">
        <label>Search clips</label>
        <input
          type="text"
          placeholder="show me the part about the AI plugin"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSearch) void callSearch();
          }}
        />
        <button disabled={!canSearch} onClick={() => void callSearch()}>
          Search
        </button>
      </section>

      {busy && <div className="ctx-busy">⏳ {busy}…</div>}
      {error && <div className="ctx-error">✗ {error}</div>}
      {result !== null && (
        <pre className="ctx-result">{JSON.stringify(result, null, 2).slice(0, 4000)}</pre>
      )}
    </div>
  );
}

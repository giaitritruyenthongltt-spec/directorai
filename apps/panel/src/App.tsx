import React, { useEffect, useState, useCallback, Suspense, lazy } from 'react';
import { Header } from './components/Header.js';
import { ChatLog } from './components/ChatLog.js';
import { CommandBar } from './components/CommandBar.js';
import { StatusBar } from './components/StatusBar.js';
import { ProgressBar } from './components/ProgressBar.js';
import { ConsentDialog } from './components/ConsentDialog.js';
import { wsClient, type ConnectionState, type LogEntry } from './bridge/ws-client.js';
import './App.css';

// P4.14 — code-split the heavy tabs so the first paint is the chat panel
// only. StylePicker pulls cut-planner + style-engine; ContextTab pulls
// the context client wiring. Both stay off the critical path.
const StylePicker = lazy(() =>
  import('./components/StylePicker.js').then((m) => ({ default: m.StylePicker }))
);
const ContextTab = lazy(() =>
  import('./components/ContextTab.js').then((m) => ({ default: m.ContextTab }))
);

function TabLoading(): React.ReactElement {
  return <div className="tab-loading">Loading…</div>;
}

export type ActiveTab = 'chat' | 'style' | 'context';

/** Restore a checkpoint into the chat log if it was created recently (< 5 min). */
const RECENT_CHECKPOINT_MS = 5 * 60_000;

interface CheckpointPayload {
  id: string;
  label: string;
  createdAt: number;
  project?: { metadata?: { name?: string } };
  activeSequence?: { id: string; name?: string } | null;
}

export function App(): React.ReactElement {
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');

  useEffect(() => {
    const unsubState = wsClient.onStateChange((s) => {
      setConnState(s);
      if (s === 'connected') {
        // P4.07 — ask the server for the most recent checkpoint and, if it
        // looks like a session that was cut short (< 5 min ago), surface a
        // recovery hint instead of starting blank.
        void wsClient
          .call<CheckpointPayload | null>('checkpoint.latest')
          .then((ckpt) => {
            if (!ckpt) return;
            const age = Date.now() - ckpt.createdAt;
            if (age > RECENT_CHECKPOINT_MS) return;
            const seqName = ckpt.activeSequence?.name ?? '(no active sequence)';
            const projName = ckpt.project?.metadata?.name ?? 'project';
            setLogs((prev) => [
              {
                id: `recovery_${ckpt.id}`,
                ts: Date.now(),
                type: 'info',
                result: `Recovered from checkpoint "${ckpt.label}" — ${projName} / ${seqName} (${Math.round(age / 1000)}s ago)`,
              },
              ...prev,
            ]);
          })
          .catch(() => {
            // No checkpoint router or no snapshots — silent.
          });
      }
    });
    const unsubLog = wsClient.onLog((entry) => {
      setLogs((prev) => [entry, ...prev].slice(0, 500)); // keep last 500 entries
    });
    wsClient.connect();
    return () => {
      unsubState();
      unsubLog();
    };
  }, []);

  const handleCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();

    // Quick shortcuts for read-only ops, bypass LLM cost
    const shortcuts: Record<string, () => Promise<unknown>> = {
      'get project': () => wsClient.call('project.get'),
      project: () => wsClient.call('project.get'),
      'list sequences': () => wsClient.call('project.listSequences'),
      sequences: () => wsClient.call('project.listSequences'),
      'list transitions': () => wsClient.call('transition.list'),
    };

    try {
      if (shortcuts[lower]) {
        await shortcuts[lower]();
        return;
      }
      if (lower.startsWith('list clips')) {
        const seq = await wsClient.call<{ id: string } | null>('project.getActiveSequence');
        if (seq) await wsClient.call('timeline.listClips', { sequenceId: seq.id });
        return;
      }

      // Everything else → LLM-driven natural-language router on the server
      await wsClient.call('nl.query', { prompt: trimmed });
    } catch (err) {
      setLogs((prev) => [
        {
          id: String(Date.now()),
          ts: Date.now(),
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        },
        ...prev,
      ]);
    }
  }, []);

  return (
    <div className="app">
      <Header connState={connState} onReconnect={() => wsClient.connect()} />
      <nav className="tabs">
        {(['chat', 'style', 'context'] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>
      <main className="main-content">
        {activeTab === 'chat' && <ChatLog entries={logs} />}
        {activeTab === 'style' && (
          <Suspense fallback={<TabLoading />}>
            <StylePicker />
          </Suspense>
        )}
        {activeTab === 'context' && (
          <Suspense fallback={<TabLoading />}>
            <ContextTab />
          </Suspense>
        )}
      </main>
      <ProgressBar />
      <CommandBar onSubmit={handleCommand} disabled={connState !== 'connected'} />
      <StatusBar connState={connState} />
      <ConsentDialog />
    </div>
  );
}

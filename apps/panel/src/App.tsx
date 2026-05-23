import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header.js';
import { ChatLog } from './components/ChatLog.js';
import { CommandBar } from './components/CommandBar.js';
import { StatusBar } from './components/StatusBar.js';
import { StylePicker } from './components/StylePicker.js';
import { wsClient, type ConnectionState, type LogEntry } from './bridge/ws-client.js';
import './App.css';

export type ActiveTab = 'chat' | 'style' | 'context';

export function App(): React.ReactElement {
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');

  useEffect(() => {
    const unsubState = wsClient.onStateChange(setConnState);
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
        {activeTab === 'style' && <StylePicker />}
        {activeTab === 'context' && (
          <div className="placeholder">
            <p>Context Engine</p>
            <small>Connect a video and run /ingest to analyze</small>
          </div>
        )}
      </main>
      <CommandBar onSubmit={handleCommand} disabled={connState !== 'connected'} />
      <StatusBar connState={connState} />
    </div>
  );
}

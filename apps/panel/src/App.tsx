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
    // Basic natural-language → tool routing
    // Full LLM routing happens on the server; this is a quick shortcut for common commands
    const lower = cmd.toLowerCase().trim();

    try {
      if (lower.startsWith('get project') || lower === 'project') {
        await wsClient.call('project.get');
      } else if (lower.startsWith('list seq') || lower === 'sequences') {
        await wsClient.call('project.listSequences');
      } else if (lower.startsWith('list clips')) {
        const seq = await wsClient.call<{ id: string }>('project.getActiveSequence');
        if (seq) await wsClient.call('timeline.listClips', { sequenceId: seq.id });
      } else if (lower.startsWith('list transitions')) {
        await wsClient.call('transition.list');
      } else {
        // Fall through to server for NL processing (future LLM routing)
        setLogs((prev) => [
          {
            id: String(Date.now()),
            ts: Date.now(),
            type: 'info',
            result: `NL routing not yet wired — type a direct command like "get project", "list sequences", "list clips"`,
          },
          ...prev,
        ]);
      }
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

import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header.js';
import { ChatLog } from './components/ChatLog.js';
import { CommandBar } from './components/CommandBar.js';
import { StatusBar } from './components/StatusBar.js';
import { ProgressBar } from './components/ProgressBar.js';
import { ConsentDialog } from './components/ConsentDialog.js';
import { FirstRunWizard } from './components/FirstRunWizard.js';
import { OnboardingTour } from './components/OnboardingTour.js';
// L2 — replaced lazy() with static imports. UXP's chunk-loader behaviour
// in Premiere 26 may differ from web browsers; lazy() risked a silent
// chunk 404 that would leave the panel blank with no error visible.
// (StylePicker BỎ — audit: demo dữ liệu giả, lạc khỏi luồng thật.)
import { ContextTab } from './components/ContextTab.js';
import { DirectorTab } from './components/DirectorTab.js';
import { AutoTab } from './components/AutoTab.js';
import { FilmTab } from './components/FilmTab.js';
import { AnalysisTab } from './components/AnalysisTab.js';
import { wsClient, type ConnectionState, type LogEntry } from './bridge/ws-client.js';
import { SessionProvider } from './state/session.js';
import './styles/tokens.css';
import './App.css';

export type ActiveTab = 'film' | 'auto' | 'analysis' | 'director' | 'chat' | 'context';

/** Nhãn tab tiếng Việt. */
const TAB_LABELS: Record<ActiveTab, string> = {
  film: '🎞️ Phim dài',
  auto: '⚡ Tự động',
  analysis: '🔍 Báo cáo',
  director: '🎬 Đạo diễn',
  chat: '💬 Trò chuyện',
  context: '📊 Ngữ cảnh',
};

/**
 * Audit-gộp — 3 NHÓM thay vì 7 tab ngang hàng (bỏ Style demo).
 *   Dựng phim (Phim/Tự động/Báo cáo) · Trợ lý (Đạo diễn/Chat) · Nâng cao (Ngữ cảnh).
 */
const TAB_GROUPS: { id: string; label: string; tabs: ActiveTab[] }[] = [
  { id: 'build', label: '🎬 Dựng phim', tabs: ['film', 'auto', 'analysis'] },
  { id: 'assist', label: '🤖 Trợ lý', tabs: ['director', 'chat'] },
  { id: 'advanced', label: '⚙️ Nâng cao', tabs: ['context'] },
];

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('film');

  // UI8 — Đồng bộ theme với host Premiere (sáng/tối). Đọc 1 lần khi mở.
  useEffect(() => {
    void import('./bridge/uxp-api.js').then(({ getHostTheme }) => {
      const t = getHostTheme();
      if (t && typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', t);
      }
    });
  }, []);

  // L1 — Send mount lifecycle + global error events to server log
  // so we can debug panel render failures without UDT DevTools.
  useEffect(() => {
    // Defer notify by one tick so wsClient WebSocket has a chance to open.
    const sendAlive = (): void => {
      try {
        wsClient.notify('_panel.lifecycle', {
          phase: 'mounted',
          ts: Date.now(),
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        });
      } catch {
        // ignore — WS not open yet, the connect handler will eventually fire
      }
    };
    const aliveTimer = setInterval(sendAlive, 5000);
    setTimeout(sendAlive, 500);

    const onErr = (e: ErrorEvent): void => {
      try {
        wsClient.notify('_panel.error', {
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
          stack: e.error?.stack,
          ts: Date.now(),
        });
      } catch {
        // ignore
      }
    };
    const onReject = (e: PromiseRejectionEvent): void => {
      try {
        wsClient.notify('_panel.error', {
          message: `unhandledrejection: ${String(e.reason)}`,
          stack: e.reason instanceof Error ? e.reason.stack : undefined,
          ts: Date.now(),
        });
      } catch {
        // ignore
      }
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onReject);
    return () => {
      clearInterval(aliveTimer);
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onReject);
    };
  }, []);

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
      {(() => {
        const group = TAB_GROUPS.find((g) => g.tabs.includes(activeTab)) ?? TAB_GROUPS[0]!;
        return (
          <>
            {/* Tầng 1 — nhóm */}
            <nav className="tab-groups">
              {TAB_GROUPS.map((g) => (
                <button
                  key={g.id}
                  className={`tab-group-btn ${g.id === group.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(g.tabs[0]!)}
                >
                  {g.label}
                </button>
              ))}
            </nav>
            {/* Tầng 2 — tab con (ẩn nếu nhóm chỉ 1 tab) */}
            {group.tabs.length > 1 && (
              <nav className="tabs">
                {group.tabs.map((tab) => (
                  <button
                    key={tab}
                    className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </nav>
            )}
          </>
        );
      })()}
      <SessionProvider>
        <main className="main-content">
          {activeTab === 'film' && <FilmTab />}
          {activeTab === 'auto' && <AutoTab />}
          {activeTab === 'director' && <DirectorTab />}
          {activeTab === 'analysis' && <AnalysisTab />}
          {activeTab === 'chat' && <ChatLog entries={logs} />}
          {activeTab === 'context' && <ContextTab />}
        </main>
      </SessionProvider>
      <ProgressBar />
      <CommandBar onSubmit={handleCommand} disabled={connState !== 'connected'} />
      <StatusBar connState={connState} />
      <FirstRunWizard />
      <ConsentDialog />
      <OnboardingTour />
    </div>
  );
}

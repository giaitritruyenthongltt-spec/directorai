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
import { RecutTab } from './components/RecutTab.js';
import { AnalysisTab } from './components/AnalysisTab.js';
import { wsClient, type ConnectionState, type LogEntry } from './bridge/ws-client.js';
import { SessionProvider } from './state/session.js';
import { Icon, type IconName } from './components/Icon.js';
import { LogDrawer } from './components/LogDrawer.js';
import { initLogCapture, pushLog, setLogSink } from './bridge/log-store.js';
import './styles/tokens.css';
import './App.css';

export type ActiveTab = 'film' | 'auto' | 'recut' | 'analysis' | 'director' | 'chat' | 'context';

/** R1 — Nhãn + ICON (SVG, không tofu) cho từng tab. */
const TAB_META: Record<ActiveTab, { label: string; icon: IconName }> = {
  film: { label: 'Phim dài', icon: 'film' },
  auto: { label: 'Tự động', icon: 'zap' },
  recut: { label: 'Tách & Tái dựng', icon: 'scissors' },
  analysis: { label: 'Báo cáo', icon: 'report' },
  director: { label: 'Đạo diễn', icon: 'clapperboard' },
  chat: { label: 'Trò chuyện', icon: 'chat' },
  context: { label: 'Ngữ cảnh', icon: 'sliders' },
};

/**
 * Audit-gộp — 3 NHÓM thay vì 7 tab ngang hàng (bỏ Style demo).
 *   Dựng phim (Phim/Tự động/Báo cáo) · Trợ lý (Đạo diễn/Chat) · Nâng cao (Ngữ cảnh).
 */
const TAB_GROUPS: { id: string; label: string; icon: IconName; tabs: ActiveTab[] }[] = [
  { id: 'build', label: 'Dựng phim', icon: 'film', tabs: ['film', 'auto', 'recut', 'analysis'] },
  { id: 'assist', label: 'Trợ lý', icon: 'sparkles', tabs: ['director', 'chat'] },
  { id: 'advanced', label: 'Nâng cao', icon: 'sliders', tabs: ['context'] },
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

  // Box log trong panel — bắt console/lỗi để check bug không cần UDT.
  useEffect(() => {
    initLogCapture();
    // P3 — đẩy warn/error ra server ops.log (bền sau reload/crash panel).
    setLogSink((it) => {
      try {
        wsClient.notify('_panel.log', it);
      } catch {
        // bỏ qua nếu WS chưa sẵn sàng
      }
    });
    return () => setLogSink(null);
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
      // Đổ vào box Nhật ký vận hành (lọc lỗi/ngữ cảnh nhanh).
      const label = entry.method ? `${entry.type} · ${entry.method}` : entry.type;
      const detail =
        entry.error ?? (entry.result !== undefined ? JSON.stringify(entry.result) : undefined);
      pushLog(
        entry.error ? 'error' : 'info',
        'ws',
        entry.error ? `${label}: ${entry.error}` : label,
        detail
      );
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
      const m = err instanceof Error ? err.message : String(err);
      pushLog('error', 'cmd', m);
      setLogs((prev) => [
        { id: String(Date.now()), ts: Date.now(), type: 'error', error: m },
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
            {/* Tầng 1 — nhóm. Dùng <div role=button> (KHÔNG <button>) vì UXP
                <button> nuốt icon span; <div> render icon đúng. */}
            <nav className="tab-groups">
              {TAB_GROUPS.map((g) => (
                <div
                  key={g.id}
                  role="button"
                  tabIndex={0}
                  className={`tab-group-btn ${g.id === group.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(g.tabs[0]!)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setActiveTab(g.tabs[0]!);
                  }}
                >
                  <Icon name={g.icon} size={15} />
                  <span>{g.label}</span>
                </div>
              ))}
            </nav>
            {/* Tầng 2 — tab con (ẩn nếu nhóm chỉ 1 tab) */}
            {group.tabs.length > 1 && (
              <nav className="tabs">
                {group.tabs.map((tab) => (
                  <div
                    key={tab}
                    role="button"
                    tabIndex={0}
                    className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setActiveTab(tab);
                    }}
                  >
                    <Icon name={TAB_META[tab].icon} size={14} />
                    <span>{TAB_META[tab].label}</span>
                  </div>
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
          {activeTab === 'recut' && <RecutTab />}
          {activeTab === 'director' && <DirectorTab />}
          {activeTab === 'analysis' && <AnalysisTab />}
          {activeTab === 'chat' && <ChatLog entries={logs} />}
          {activeTab === 'context' && <ContextTab />}
        </main>
      </SessionProvider>
      <ProgressBar />
      <LogDrawer />
      <CommandBar onSubmit={handleCommand} disabled={connState !== 'connected'} />
      <StatusBar connState={connState} />
      <FirstRunWizard />
      <ConsentDialog />
      <OnboardingTour />
    </div>
  );
}

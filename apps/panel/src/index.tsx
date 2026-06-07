import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { initPanelSentry, captureException } from './bridge/sentry-init.js';
import { wsClient } from './bridge/ws-client.js';

// Áp cỡ giao diện đã lưu NGAY (trước khi render) để không nháy. Chạy từ bundle
// nên hợp lệ CSP của UXP (KHÔNG dùng inline <script> trong HTML — UXP chặn).
try {
  const s = Number(localStorage.getItem('directorai.uiScale'));
  if (s >= 0.8 && s <= 1.6) {
    document.documentElement.style.setProperty('--ui-scale', String(s));
  }
} catch {
  // localStorage không sẵn → bỏ qua, dùng mặc định 1.
}

// A4 — Chuyển console.info/warn/error của panel về server log (qua
// _panel.console) để debug được mà không cần mở UDT DevTools.
(['info', 'warn', 'error'] as const).forEach((level) => {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]): void => {
    orig(...args);
    try {
      const text = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ')
        .slice(0, 500);
      wsClient.notify('_panel.console', { level, text });
    } catch {
      // ignore
    }
  };
});

void initPanelSentry();

window.addEventListener('error', (e) => {
  captureException(e.error ?? new Error(e.message));
});
window.addEventListener('unhandledrejection', (e) => {
  captureException(e.reason);
});

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

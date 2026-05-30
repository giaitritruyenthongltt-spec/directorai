import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { initPanelSentry, captureException } from './bridge/sentry-init.js';

void initPanelSentry();

window.addEventListener('error', (e) => {
  captureException(e.error ?? new Error(e.message));
});
window.addEventListener('unhandledrejection', (e) => {
  captureException(e.reason);
});

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

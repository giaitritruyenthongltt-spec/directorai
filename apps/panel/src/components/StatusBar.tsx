import React from 'react';
import type { ConnectionState } from '../bridge/ws-client.js';
import { getProjectName, getActiveSequenceName, isInUXP } from '../bridge/uxp-api.js';
import './StatusBar.css';

interface Props {
  connState: ConnectionState;
}

export function StatusBar({ connState }: Props): React.ReactElement {
  const project = getProjectName();
  const sequence = getActiveSequenceName();

  return (
    <div className="status-bar">
      <span className="status-item">{isInUXP ? '⚡ UXP' : '🔷 Mock'} &nbsp;|</span>
      <span className="status-item">📁 {project}</span>
      <span className="status-sep">|</span>
      <span className="status-item">🎬 {sequence}</span>
      <span className="status-sep">|</span>
      <span className="status-item" style={{ opacity: 0.6 }}>
        {connState === 'connected' ? 'ws ok' : connState}
      </span>
    </div>
  );
}

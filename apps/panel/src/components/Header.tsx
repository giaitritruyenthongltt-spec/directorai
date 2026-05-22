import React from 'react';
import type { ConnectionState } from '../bridge/ws-client.js';
import './Header.css';

interface Props {
  connState: ConnectionState;
  onReconnect: () => void;
}

const STATE_LABEL: Record<ConnectionState, string> = {
  disconnected: '● Disconnected',
  connecting: '● Connecting…',
  connected: '● Connected',
  error: '● Error',
};

const STATE_COLOR: Record<ConnectionState, string> = {
  disconnected: '#888',
  connecting: '#ff9800',
  connected: '#4caf50',
  error: '#f44336',
};

export function Header({ connState, onReconnect }: Props): React.ReactElement {
  return (
    <header className="header">
      <div className="header-left">
        <span className="logo">DirectorAI</span>
        <span className="version">v0.2</span>
      </div>
      <div className="header-right">
        <span className="conn-state" style={{ color: STATE_COLOR[connState] }}>
          {STATE_LABEL[connState]}
        </span>
        {connState !== 'connected' && (
          <button className="reconnect-btn" onClick={onReconnect}>
            Reconnect
          </button>
        )}
      </div>
    </header>
  );
}

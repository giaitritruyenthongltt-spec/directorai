import React from 'react';
import type { ConnectionState } from '../bridge/ws-client.js';
import { Icon } from './Icon.js';
import './Header.css';

interface Props {
  connState: ConnectionState;
  onReconnect: () => void;
}

const STATE_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Mất kết nối',
  connecting: 'Đang kết nối…',
  connected: 'Đã kết nối',
  error: 'Lỗi kết nối',
};

export function Header({ connState, onReconnect }: Props): React.ReactElement {
  return (
    <header className="header">
      <div className="header-left">
        <span className="logo">
          <Icon name="clapperboard" size={17} className="logo-icon" />
          DirectorAI
        </span>
        <span className="version">v2.1</span>
      </div>
      <div className="header-right">
        <span className={`conn-state conn-${connState}`}>
          <span className="conn-dot" aria-hidden="true" />
          {STATE_LABEL[connState]}
        </span>
        {connState !== 'connected' && (
          <button className="reconnect-btn" onClick={onReconnect}>
            <Icon name="refresh" size={13} />
            Kết nối lại
          </button>
        )}
      </div>
    </header>
  );
}

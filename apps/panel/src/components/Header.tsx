import React, { useEffect, useState } from 'react';
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

// Phóng to/thu nhỏ toàn panel — ghi vào --ui-scale (#root { zoom }), nhớ qua localStorage.
const SCALE_KEY = 'directorai.uiScale';
const SCALE_MIN = 0.8;
const SCALE_MAX = 1.6;
const SCALE_STEP = 0.1;

function loadScale(): number {
  try {
    const raw = Number(localStorage.getItem(SCALE_KEY));
    return raw >= SCALE_MIN && raw <= SCALE_MAX ? raw : 1;
  } catch {
    return 1;
  }
}

export function Header({ connState, onReconnect }: Props): React.ReactElement {
  const [scale, setScale] = useState<number>(loadScale);

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(scale));
    try {
      localStorage.setItem(SCALE_KEY, String(scale));
    } catch {
      // localStorage không sẵn → vẫn áp scale runtime, chỉ không nhớ.
    }
  }, [scale]);

  const bump = (delta: number): void =>
    setScale((s) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((s + delta) * 10) / 10)));

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
        <div className="zoom-control" title="Phóng to / thu nhỏ giao diện">
          <button
            className="zoom-btn"
            onClick={() => bump(-SCALE_STEP)}
            disabled={scale <= SCALE_MIN}
            aria-label="Thu nhỏ giao diện"
          >
            A−
          </button>
          <button
            className="zoom-pct"
            onClick={() => setScale(1)}
            title="Bấm để về 100%"
            aria-label="Đặt lại cỡ giao diện 100%"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            className="zoom-btn"
            onClick={() => bump(SCALE_STEP)}
            disabled={scale >= SCALE_MAX}
            aria-label="Phóng to giao diện"
          >
            A+
          </button>
        </div>
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

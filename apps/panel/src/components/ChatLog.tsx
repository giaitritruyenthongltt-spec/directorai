import React from 'react';
import type { LogEntry } from '../bridge/ws-client.js';
import './ChatLog.css';

interface Props {
  entries: LogEntry[];
}

const TYPE_ICON: Record<LogEntry['type'], string> = {
  tool_call: '→',
  tool_result: '←',
  error: '✗',
  info: 'i',
};

const TYPE_COLOR: Record<LogEntry['type'], string> = {
  tool_call: '#5b9bd5',
  tool_result: '#4caf50',
  error: '#f44336',
  info: '#888',
};

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'string') return v.length > 120 ? v.slice(0, 120) + '…' : v;
  const json = JSON.stringify(v, null, 2);
  return json.length > 300 ? json.slice(0, 300) + '…' : json;
}

export function ChatLog({ entries }: Props): React.ReactElement {
  if (entries.length === 0) {
    return (
      <div className="chat-log empty">
        <p>No activity yet.</p>
        <small>Type a command below or ask Claude to control Premiere.</small>
      </div>
    );
  }

  return (
    <div className="chat-log">
      {entries.map((entry) => (
        <div key={entry.id} className={`log-entry log-${entry.type}`}>
          <span className="log-icon" style={{ color: TYPE_COLOR[entry.type] }}>
            {TYPE_ICON[entry.type]}
          </span>
          <div className="log-body">
            {entry.method && <div className="log-method">{entry.method}</div>}
            <pre className="log-value">{entry.error ? entry.error : formatValue(entry.result)}</pre>
            <span className="log-ts">{new Date(entry.ts).toLocaleTimeString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

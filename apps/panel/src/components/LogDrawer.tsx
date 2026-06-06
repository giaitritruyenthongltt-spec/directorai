/**
 * LogDrawer — box "Nhật ký vận hành" gọn ở đáy panel (mặc định thu).
 *
 * Mở để xem lỗi/sự kiện gần nhất (panel error, console, WS/RPC). Lọc theo mức,
 * Sao chép (paste gửi hỗ trợ), Xoá. Dữ liệu từ bridge/log-store.
 */

import React, { useState, useSyncExternalStore } from 'react';
import { subscribeLogs, getLogs, clearLogs, type LogItem } from '../bridge/log-store.js';
import { Icon } from './Icon.js';
import { ClickBox } from './ui/primitives.js';
import './LogDrawer.css';

type Filter = 'all' | 'warn' | 'error';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function matches(it: LogItem, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'error') return it.level === 'error';
  return it.level !== 'info'; // warn = warn + error
}

export function LogDrawer(): React.ReactElement {
  const items = useSyncExternalStore(subscribeLogs, getLogs);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleRow = (id: number): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const errN = items.reduce((n, i) => n + (i.level === 'error' ? 1 : 0), 0);
  const warnN = items.reduce((n, i) => n + (i.level === 'warn' ? 1 : 0), 0);
  const shown = items.filter((i) => matches(i, filter));

  const copyAll = (): void => {
    const text = items
      .slice()
      .reverse()
      .map(
        (i) =>
          `[${fmtTime(i.ts)}] ${i.level.toUpperCase()} ${i.src}: ${i.msg}${i.detail ? `\n    ${i.detail}` : ''}`
      )
      .join('\n');
    try {
      void navigator.clipboard?.writeText?.(text);
    } catch {
      // UXP có thể không có clipboard API — bỏ qua, vẫn chọn text được.
    }
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: `Tất cả (${items.length})` },
    { key: 'warn', label: `Cảnh báo (${warnN})` },
    { key: 'error', label: `Lỗi (${errN})` },
  ];

  return (
    <div className={`logdrawer${open ? ' open' : ''}`}>
      <div className="logdrawer-bar">
        <ClickBox className="logdrawer-toggle" onClick={() => setOpen((v) => !v)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
          <Icon name="list" size={13} />
          <span>Nhật ký vận hành</span>
          {errN > 0 && <span className="logdrawer-badge err">{errN}</span>}
          {errN === 0 && warnN > 0 && <span className="logdrawer-badge warn">{warnN}</span>}
        </ClickBox>
        {open && (
          <div className="logdrawer-tools">
            {FILTERS.map((f) => (
              <ClickBox
                key={f.key}
                className={`logdrawer-filter${filter === f.key ? ' on' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </ClickBox>
            ))}
            <ClickBox className="logdrawer-act" onClick={copyAll} title="Sao chép toàn bộ">
              <Icon name="list" size={12} /> Sao chép
            </ClickBox>
            <ClickBox className="logdrawer-act" onClick={() => clearLogs()} title="Xoá nhật ký">
              <Icon name="trash" size={12} /> Xoá
            </ClickBox>
          </div>
        )}
      </div>
      {open && (
        <div className="logdrawer-body">
          {shown.length === 0 ? (
            <div className="logdrawer-empty">Chưa có sự kiện nào.</div>
          ) : (
            shown.map((i) => (
              <div key={i.id} className={`logrow lv-${i.level}`}>
                <ClickBox
                  className={`logrow-head${i.detail ? ' has-detail' : ''}`}
                  onClick={() => i.detail && toggleRow(i.id)}
                >
                  {i.detail && (
                    <Icon name={expanded.has(i.id) ? 'chevronDown' : 'chevronRight'} size={11} />
                  )}
                  <span className="logrow-ts">{fmtTime(i.ts)}</span>
                  <span className={`logrow-lv lv-${i.level}`}>{i.level}</span>
                  <span className="logrow-src">{i.src}</span>
                  <span className="logrow-msg">{i.msg}</span>
                </ClickBox>
                {i.detail && expanded.has(i.id) && <pre className="logrow-detail">{i.detail}</pre>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

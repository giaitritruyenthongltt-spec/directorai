/**
 * UI6 — Bảng duyệt clip cho phim dài (400+ clip).
 *
 * Thay "1 ô textarea" (vỡ khi >500 clip) bằng bảng có Ô LỌC + SẮP XẾP +
 * cuộn. Hiển thị tên/loại/đã-có-path; cảnh báo clip chưa map full path
 * (cần quét thư mục — D4).
 */

import React, { useMemo, useState } from 'react';
import './ClipTable.css';

export interface ClipRow {
  id?: string;
  name: string;
  path?: string;
  kind?: string;
  hasFullPath?: boolean;
}

type SortKey = 'name' | 'kind' | 'path';

export function ClipTable(props: { clips: ClipRow[]; maxRows?: number }): React.ReactElement {
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  const maxRows = props.maxRows ?? 500;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = props.clips;
    if (needle) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) || (c.path ?? '').toLowerCase().includes(needle)
      );
    }
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = String(a[sortKey] ?? '').toLowerCase();
      const bv = String(b[sortKey] ?? '').toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [props.clips, q, sortKey, asc]);

  const shown = filtered.slice(0, maxRows);
  const resolved = props.clips.filter((c) => c.hasFullPath).length;

  const th = (key: SortKey, label: string): React.ReactElement => (
    <th
      className={`clt-th${sortKey === key ? ' clt-th-active' : ''}`}
      onClick={() => {
        if (sortKey === key) setAsc((v) => !v);
        else {
          setSortKey(key);
          setAsc(true);
        }
      }}
    >
      {label}
      {sortKey === key && <span className="clt-arrow">{asc ? ' ▲' : ' ▼'}</span>}
    </th>
  );

  return (
    <div className="clt-wrap">
      <div className="clt-toolbar">
        <input
          className="clt-search"
          placeholder="🔍 Lọc clip theo tên/đường dẫn…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="clt-count">
          {filtered.length}/{props.clips.length} clip · {resolved} có path
        </span>
      </div>
      <div className="clt-scroll">
        <table className="clt-table">
          <thead>
            <tr>
              {th('name', 'Tên clip')}
              {th('kind', 'Loại')}
              {th('path', 'Đường dẫn')}
            </tr>
          </thead>
          <tbody>
            {shown.map((c, i) => (
              <tr key={c.id ?? `${c.name}-${i}`}>
                <td className="clt-name" title={c.name}>
                  {c.name}
                </td>
                <td className="clt-kind">{c.kind ?? '—'}</td>
                <td className={`clt-path${c.hasFullPath ? '' : ' clt-path-missing'}`}>
                  {c.hasFullPath ? c.path : '⚠️ chưa map (quét thư mục)'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > maxRows && (
          <div className="clt-more">… và {filtered.length - maxRows} clip nữa (hãy lọc bớt)</div>
        )}
        {filtered.length === 0 && <div className="clt-empty">Không có clip khớp bộ lọc.</div>}
      </div>
    </div>
  );
}

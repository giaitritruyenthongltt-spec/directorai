/**
 * UI6 — Bảng duyệt clip cho phim dài (400+ clip).
 *
 * Thay "1 ô textarea" (vỡ khi >500 clip) bằng bảng có Ô LỌC + SẮP XẾP +
 * cuộn. Hiển thị tên/loại/đã-có-path; cảnh báo clip chưa map full path
 * (cần quét thư mục — D4).
 *
 * L8 — VIRTUALIZE (windowing): với phim dài hàng trăm clip, render HẾT vào
 * DOM làm panel giật. Ở đây chỉ render các dòng đang NHÌN THẤY (+ overscan),
 * dùng 2 hàng "spacer" giữ đúng chiều cao cuộn. Đo chiều cao 1 dòng ĐỘNG để
 * tính cửa sổ chính xác (không phụ thuộc magic-number theo theme/zoom).
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.js';
import { ClickBox } from './ui/primitives.js';
import './ClipTable.css';

export interface ClipRow {
  id?: string;
  name: string;
  path?: string;
  kind?: string;
  hasFullPath?: boolean;
}

type SortKey = 'name' | 'kind' | 'path';

/** Số dòng đệm trên/dưới khung nhìn (cuộn nhanh không thấy hụt). */
const OVERSCAN = 8;
/** Dưới ngưỡng này thì render thẳng (khỏi tính toán cửa sổ). */
const VIRT_THRESHOLD = 60;

export function ClipTable(props: { clips: ClipRow[]; maxRows?: number }): React.ReactElement {
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  // Mặc định THU GỌN: chỉ hiện ~5 dòng + cuộn riêng (danh sách dài không
  // chiếm cả panel). Bấm để mở rộng. (Cap chiều cao dùng px THUẦN vì UXP
  // KHÔNG hỗ trợ min()/vh trong CSS → cap cũ bị bỏ qua.)
  const [expanded, setExpanded] = useState(false);
  // L8 — virtualize gánh được nhiều dòng nên nới trần (trước cứng 500).
  const maxRows = props.maxRows ?? 2000;

  // ── Trạng thái cuộn/đo cho windowing ────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLTableRowElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(420);
  const [rowH, setRowH] = useState(29);

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

  // Theo dõi cuộn + đổi kích thước khung cuộn (ResizeObserver có ở webview UXP).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = (): void => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => setViewH(el.clientHeight || 420));
    ro.observe(el);
    setViewH(el.clientHeight || 420);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  // Lọc/sắp xếp đổi → về đầu danh sách (tránh cửa sổ rỗng do scrollTop cũ).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [q, sortKey, asc]);

  // ── Tính cửa sổ hiển thị ────────────────────────────────────────────
  const total = shown.length;
  const virtual = total > VIRT_THRESHOLD;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN) : 0;
  const visCount = virtual ? Math.ceil(viewH / rowH) + OVERSCAN * 2 : total;
  const end = virtual ? Math.min(total, start + visCount) : total;
  const padTop = start * rowH;
  const padBottom = Math.max(0, (total - end) * rowH);
  const windowRows = shown.slice(start, end);

  // Cap chiều cao hộp cuộn (px thuần): thu gọn = 5 dòng, mở rộng = 14 dòng.
  const COMPACT_ROWS = 5;
  const HEADER_H = 34;
  const scrollMaxH = Math.round(HEADER_H + (expanded ? 14 : COMPACT_ROWS) * rowH);
  const canToggle = total > COMPACT_ROWS;

  // Đo chiều cao THỰC của 1 dòng (gồm border) → tự hiệu chỉnh theo theme/zoom.
  useLayoutEffect(() => {
    const h = measureRef.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - rowH) > 0.5) setRowH(h);
  }, [windowRows.length, rowH, virtual]);

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
        {canToggle && (
          <ClickBox
            className="clt-toggle"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Thu gọn danh sách' : 'Mở rộng danh sách'}
          >
            <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={13} />
            {expanded ? 'Thu gọn' : `Xem hết (${total})`}
          </ClickBox>
        )}
      </div>
      <div className="clt-scroll" ref={scrollRef} style={{ maxHeight: scrollMaxH }}>
        <table className="clt-table">
          <thead>
            <tr>
              {th('name', 'Tên clip')}
              {th('kind', 'Loại')}
              {th('path', 'Đường dẫn')}
            </tr>
          </thead>
          <tbody>
            {virtual && padTop > 0 && (
              <tr aria-hidden="true" className="clt-spacer">
                <td colSpan={3} style={{ height: padTop }} />
              </tr>
            )}
            {windowRows.map((c, i) => (
              <tr key={c.id ?? `${c.name}-${start + i}`} ref={i === 0 ? measureRef : undefined}>
                <td className="clt-name" title={c.name}>
                  {c.name}
                </td>
                <td className="clt-kind">{c.kind ?? '—'}</td>
                <td className={`clt-path${c.hasFullPath ? '' : ' clt-path-missing'}`}>
                  {c.hasFullPath ? c.path : '⚠️ chưa map (quét thư mục)'}
                </td>
              </tr>
            ))}
            {virtual && padBottom > 0 && (
              <tr aria-hidden="true" className="clt-spacer">
                <td colSpan={3} style={{ height: padBottom }} />
              </tr>
            )}
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

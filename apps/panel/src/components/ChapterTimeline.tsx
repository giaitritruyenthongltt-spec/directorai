/**
 * UI5 — Khung Timeline/Chương: hiển thị CẤU TRÚC phim dài.
 *
 * Lộ ra lớp tự sự `chapters` mà planner (LF3) sinh ra: mỗi chương là 1 dải
 * ngang, rộng theo thời lượng mục tiêu (hoặc số clip), tô màu theo mục đích
 * tự sự, kèm nhịp + số clip. Đây là thứ thay cho "1 ô textarea" để người dùng
 * NHÌN được tổng quan phim dài.
 */

import React from 'react';
import './ChapterTimeline.css';

export interface ChapterView {
  name: string;
  purpose: string;
  pacing: string;
  target_duration_sec: number;
  clip_paths: string[];
}

/** Màu theo mục đích tự sự (nhất quán với SegmentPurpose ở core). */
const PURPOSE_COLOR: Record<string, string> = {
  intro: '#6366f1',
  establishing: '#5b9bd5',
  buildup: '#0ea5e9',
  action: '#f59e0b',
  climax: '#ef4444',
  resolution: '#10b981',
  comedy: '#a855f7',
  transition: '#64748b',
  outro: '#14b8a6',
};

const PURPOSE_LABEL: Record<string, string> = {
  intro: 'Mở màn',
  establishing: 'Thiết lập',
  buildup: 'Dồn nén',
  action: 'Hành động',
  climax: 'Cao trào',
  resolution: 'Giải quyết',
  comedy: 'Hài',
  transition: 'Chuyển',
  outro: 'Kết',
};

function fmtDur(sec: number): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}p${s.toString().padStart(2, '0')}` : `${s}s`;
}

export function ChapterTimeline(props: {
  chapters: ChapterView[];
  totalTargetSec?: number;
}): React.ReactElement | null {
  const chapters = props.chapters ?? [];
  if (chapters.length === 0) return null;

  // Trọng số dải: ưu tiên thời lượng mục tiêu; fallback số clip.
  const weights = chapters.map((c) => c.target_duration_sec || c.clip_paths.length || 1);
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  const totalClips = chapters.reduce((a, c) => a + c.clip_paths.length, 0);
  const totalSec =
    props.totalTargetSec || chapters.reduce((a, c) => a + (c.target_duration_sec || 0), 0);

  return (
    <div className="ct-wrap">
      <div className="ct-head">
        <span className="ct-head-title">🎞️ Cấu trúc phim ({chapters.length} chương)</span>
        <span className="ct-head-meta">
          {totalClips} clip{totalSec ? ` · ~${fmtDur(totalSec)}` : ''}
        </span>
      </div>

      {/* Dải băng tỉ lệ */}
      <div className="ct-bar">
        {chapters.map((c, i) => {
          const color = PURPOSE_COLOR[c.purpose] ?? '#5b9bd5';
          const pct = (weights[i]! / totalW) * 100;
          return (
            <div
              key={i}
              className="ct-seg"
              style={{ width: `${pct}%`, background: color }}
              title={`${c.name} — ${PURPOSE_LABEL[c.purpose] ?? c.purpose} · ${c.clip_paths.length} clip`}
            >
              <span className="ct-seg-label">{i + 1}</span>
            </div>
          );
        })}
      </div>

      {/* Danh sách chương chi tiết */}
      <ol className="ct-list">
        {chapters.map((c, i) => {
          const color = PURPOSE_COLOR[c.purpose] ?? '#5b9bd5';
          return (
            <li key={i} className="ct-item">
              <span className="ct-item-dot" style={{ background: color }} />
              <span className="ct-item-idx">{i + 1}</span>
              <span className="ct-item-name">{c.name}</span>
              <span className="ct-item-purpose" style={{ color }}>
                {PURPOSE_LABEL[c.purpose] ?? c.purpose}
              </span>
              <span className="ct-item-meta">
                {c.clip_paths.length} clip
                {c.target_duration_sec ? ` · ~${fmtDur(c.target_duration_sec)}` : ''}
                {c.pacing ? ` · ${c.pacing}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

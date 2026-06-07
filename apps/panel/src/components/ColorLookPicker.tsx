/**
 * P2 — Bộ chọn "look" màu cho module Sửa màu (tab Tự động).
 *
 * Gallery 12 mẫu tiếng Việt + thanh cường độ + chế độ "Tự động theo cảnh".
 * Chỉ trình bày; state + lưu localStorage do AutoTab giữ. id look PHẢI khớp
 * COLOR_LOOKS trong @directorai/effect-library (server validate theo id).
 */

import React from 'react';
import './ColorLookPicker.css';

export interface ColorLookValue {
  look: string;
  intensity: number; // 0..100
  auto: boolean; // tự chọn look theo mood mỗi cảnh
}

interface LookMeta {
  id: string;
  label: string;
  emoji: string;
}

// Khớp COLOR_LOOKS (effect-library/src/color-looks.ts).
export const LOOKS: readonly LookMeta[] = [
  { id: 'pastel_dream', label: 'Trong sáng', emoji: '🌤️' },
  { id: 'teal_orange', label: 'Điện ảnh', emoji: '🎬' },
  { id: 'warm_vlog', label: 'Ấm áp', emoji: '🔥' },
  { id: 'cold_drama', label: 'Lạnh / Drama', emoji: '❄️' },
  { id: 'punchy_vibrant', label: 'Rực rỡ', emoji: '⚡' },
  { id: 'sunset_glow', label: 'Hoàng hôn', emoji: '🌅' },
  { id: 'vintage_kodak', label: 'Phim cũ', emoji: '📽️' },
  { id: 'desaturated_film', label: 'Phim trầm', emoji: '🎞️' },
  { id: 'noir_high_contrast', label: 'Tương phản cao', emoji: '🌑' },
  { id: 'tech_blue', label: 'Xanh công nghệ', emoji: '🔵' },
  { id: 'matrix_green', label: 'Xanh Matrix', emoji: '🟢' },
  { id: 'bw_documentary', label: 'Đen trắng', emoji: '⚫' },
];

interface Props {
  value: ColorLookValue;
  onChange: (v: ColorLookValue) => void;
}

export function ColorLookPicker({ value, onChange }: Props): React.ReactElement {
  const set = (patch: Partial<ColorLookValue>): void => onChange({ ...value, ...patch });
  return (
    <div className="clp">
      <label className="clp-auto">
        <input
          type="checkbox"
          checked={value.auto}
          onChange={(e) => set({ auto: (e.target as HTMLInputElement).checked })}
        />
        <span>Tự động theo cảnh (AI/CV chọn mẫu hợp mood mỗi clip)</span>
      </label>

      <div className={`clp-grid ${value.auto ? 'clp-dim' : ''}`}>
        {LOOKS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`clp-look ${value.look === l.id && !value.auto ? 'on' : ''}`}
            disabled={value.auto}
            title={l.label}
            onClick={() => set({ look: l.id })}
          >
            <span className="clp-emoji">{l.emoji}</span>
            <span className="clp-label">{l.label}</span>
          </button>
        ))}
      </div>

      <label className="clp-intensity">
        <span>Cường độ</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.intensity}
          onChange={(e) => set({ intensity: Number((e.target as HTMLInputElement).value) })}
        />
        <span className="clp-pct">{value.intensity}%</span>
      </label>
    </div>
  );
}

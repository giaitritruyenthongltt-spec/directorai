/**
 * SPEED P4 — Bộ cài đặt ⚙️ cho module "Điều chỉnh tốc độ" (tab Tự động).
 *
 * Chỉ trình bày cài đặt; gọi plan/render + bảng kết quả do AutoTab giữ. Tham số
 * khớp SpeedParams phía server (camelCase → snake_case ở director-tools).
 */

import React from 'react';
import './SpeedPanel.css';

export interface SpeedSettings {
  mode: 'content' | 'normalize' | 'duration';
  slowmoFloor: number; // slow-mo MẠNH nhất (0.5 = phim chậm nửa tốc); cảnh động nhất
  speedupCeiling: number; // tua NHANH nhất (2.0); cảnh tĩnh nhất
  smoothFps: number; // fps-gate: dưới mức này slow-mo mạnh bị giới hạn (chống giật)
  targetDurationSec: number; // chỉ mode "đủ thời lượng"
}

export const DEFAULT_SPEED: SpeedSettings = {
  mode: 'content',
  slowmoFloor: 0.5,
  speedupCeiling: 2.0,
  smoothFps: 50,
  targetDurationSec: 0,
};

interface ModeMeta {
  id: SpeedSettings['mode'];
  label: string;
  emoji: string;
  hint: string;
}

const MODES: readonly ModeMeta[] = [
  {
    id: 'content',
    label: 'Theo nội dung',
    emoji: '🎯',
    hint: 'Cảnh động → slow-mo, cảnh tĩnh → tua nhanh (mặc định).',
  },
  {
    id: 'normalize',
    label: 'Chuẩn hoá chuyển động',
    emoji: '⚖️',
    hint: 'Cân nhịp: clip nào cũng về cùng mức "động" tương đối.',
  },
  {
    id: 'duration',
    label: 'Đủ thời lượng',
    emoji: '⏱️',
    hint: 'Co/giãn đều để tổng thời lượng đạt mục tiêu.',
  },
];

interface Props {
  value: SpeedSettings;
  onChange: (v: SpeedSettings) => void;
}

export function SpeedPanel({ value, onChange }: Props): React.ReactElement {
  const set = (patch: Partial<SpeedSettings>): void => onChange({ ...value, ...patch });
  const activeMode = MODES.find((m) => m.id === value.mode) ?? MODES[0]!;
  return (
    <div className="spp">
      <div className="spp-modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`spp-mode ${value.mode === m.id ? 'on' : ''}`}
            title={m.hint}
            onClick={() => set({ mode: m.id })}
          >
            <span className="spp-emoji">{m.emoji}</span>
            <span className="spp-label">{m.label}</span>
          </button>
        ))}
      </div>
      <div className="spp-hint">{activeMode.hint}</div>

      {value.mode === 'duration' && (
        <label className="spp-row">
          <span>Thời lượng mục tiêu (giây)</span>
          <input
            type="number"
            min={1}
            step={1}
            value={value.targetDurationSec || ''}
            placeholder="vd 60"
            onChange={(e) =>
              set({ targetDurationSec: Number((e.target as HTMLInputElement).value) || 0 })
            }
          />
        </label>
      )}

      {value.mode !== 'duration' && (
        <>
          <label className="spp-row">
            <span>Slow-mo mạnh nhất</span>
            <input
              type="range"
              min={0.5}
              max={0.9}
              step={0.05}
              value={value.slowmoFloor}
              onChange={(e) => set({ slowmoFloor: Number((e.target as HTMLInputElement).value) })}
            />
            <span className="spp-val">{value.slowmoFloor.toFixed(2)}×</span>
          </label>
          <label className="spp-row">
            <span>Tua nhanh nhất</span>
            <input
              type="range"
              min={1.2}
              max={2.0}
              step={0.1}
              value={value.speedupCeiling}
              onChange={(e) =>
                set({ speedupCeiling: Number((e.target as HTMLInputElement).value) })
              }
            />
            <span className="spp-val">{value.speedupCeiling.toFixed(1)}×</span>
          </label>
        </>
      )}

      <label className="spp-row">
        <span>Chặn slow-mo dưới (fps)</span>
        <input
          type="range"
          min={24}
          max={60}
          step={1}
          value={value.smoothFps}
          onChange={(e) => set({ smoothFps: Number((e.target as HTMLInputElement).value) })}
        />
        <span className="spp-val">{value.smoothFps}fps</span>
      </label>
      <div className="spp-note">
        Clip fps thấp hơn mức này sẽ KHÔNG slow-mo mạnh (tránh giật). Render ra file mới cạnh clip
        gốc, không đụng timeline — bạn tự kéo vào.
      </div>
    </div>
  );
}

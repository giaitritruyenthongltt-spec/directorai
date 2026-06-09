/**
 * P2b — Test module SpeedPanel (contract dữ liệu + module load sạch).
 * Đây là test COMPONENT-MODULE đầu tiên của panel (trước chỉ có reconnect-machine).
 * Không render DOM (panel vitest = node env) — kiểm hằng số + export ổn định.
 */
import { describe, it, expect } from 'vitest';
import { SpeedPanel, DEFAULT_SPEED, type SpeedSettings } from '../SpeedPanel.js';

describe('SpeedPanel module', () => {
  it('DEFAULT_SPEED hợp lệ (mode content, clamp ⊂ [0.5,2.0])', () => {
    expect(DEFAULT_SPEED.mode).toBe('content');
    expect(DEFAULT_SPEED.slowmoFloor).toBeGreaterThanOrEqual(0.5);
    expect(DEFAULT_SPEED.speedupCeiling).toBeLessThanOrEqual(2.0);
    expect(DEFAULT_SPEED.smoothFps).toBeGreaterThan(0);
    expect(DEFAULT_SPEED.targetDurationSec).toBe(0);
  });

  it('SpeedPanel export là component (function)', () => {
    expect(typeof SpeedPanel).toBe('function');
  });

  it('SpeedSettings.mode nhận đúng 3 chế độ', () => {
    const modes: SpeedSettings['mode'][] = ['content', 'normalize', 'duration'];
    for (const m of modes) {
      const v: SpeedSettings = { ...DEFAULT_SPEED, mode: m };
      expect(v.mode).toBe(m);
    }
  });
});

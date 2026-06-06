/**
 * RecutTab — "Tách & Tái dựng" (Lane A, MVP).
 *
 * Đưa 1 video đã-dựng → "Phân mảnh cảnh" (Scene Edit Detection native) → sequence
 * cắt-cảnh editable → "Tái dựng" chống-trùng cơ bản (rename Cảnh N + tỉa đuôi).
 * Các đòn nặng (flip/crop/speed/tách BGM) thuộc Lane B (headless) — pha kế.
 */

import React, { useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import { Section, Button, Badge, ErrorBox } from './ui/primitives.js';
import { HelpButton } from './HelpButton.js';
import './RecutTab.css';

interface Scene {
  index: number;
  startSec: number;
  durationSec: number;
}
interface DetectResult {
  sequenceId?: string;
  sequenceName?: string;
  sceneCount?: number;
  scenes?: Scene[];
  error?: string;
}
interface DedupStep {
  clipId: string;
  op: string;
  ok: boolean;
  error?: string;
}
interface DedupResult {
  applied: number;
  sceneCount: number;
  checkpointId: string | null;
  steps: DedupStep[];
}

export function RecutTab(): React.ReactElement {
  const [videoPath, setVideoPath] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [det, setDet] = useState<DetectResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Checklist tái dựng
  const [optRename, setOptRename] = useState(true);
  const [optTrim, setOptTrim] = useState(false);
  const [trimSec, setTrimSec] = useState(0.15);
  const [applying, setApplying] = useState(false);
  const [dedup, setDedup] = useState<DedupResult | null>(null);

  const detect = async (): Promise<void> => {
    setErr(null);
    setDedup(null);
    setDet(null);
    const path = videoPath.trim();
    if (!path) {
      setErr('Hãy nhập đường dẫn video (vd E:\\T11\\tap1.mp4).');
      return;
    }
    setDetecting(true);
    try {
      const r = await wsClient.call<DetectResult>('recut.detectScenes', { videoPath: path });
      if (r?.error) setErr(r.error);
      setDet(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  };

  const rebuild = async (): Promise<void> => {
    if (!det?.sequenceId) return;
    setErr(null);
    setApplying(true);
    try {
      const r = await wsClient.call<DedupResult>('recut.applyDedup', {
        sequenceId: det.sequenceId,
        options: { rename: optRename, trimTailSec: optTrim ? trimSec : 0 },
      });
      setDedup(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  const scenes = det?.scenes ?? [];

  return (
    <div className="recut-tab">
      <Section title="Nguồn video (đã dựng)" iconName="film">
        <div className="recut-help">
          <span>Đưa 1 video cũ đã hoàn thiện vào để tách lại các cảnh, tái dựng bản mới.</span>
          <HelpButton
            title="Tách & Tái dựng"
            lines={[
              'Bước 1: dán đường dẫn video → "Phân mảnh cảnh" (Premiere tự tách theo điểm cắt).',
              'Bước 2: tích đòn chống-trùng → "Tái dựng".',
              'Đòn nặng (tách nhạc/voice, lật, đổi tốc độ) sẽ ở chế độ Hàng loạt headless — sắp có.',
            ]}
          />
        </div>
        <input
          className="recut-input"
          type="text"
          placeholder="E:\T11\tap1.mp4"
          value={videoPath}
          onChange={(e) => setVideoPath((e.target as HTMLInputElement).value)}
        />
        <Button variant="primary" busy={detecting} onClick={detect} iconName="scissors" full>
          {detecting ? 'Đang phân mảnh…' : 'Phân mảnh cảnh'}
        </Button>
      </Section>

      <ErrorBox error={err} />

      {det && !det.error && (
        <Section
          title={
            <span>
              Cảnh phát hiện <Badge tone="accent">{det.sceneCount ?? scenes.length}</Badge>
            </span>
          }
          iconName="list"
        >
          <div className="recut-seqname">Sequence: {det.sequenceName ?? det.sequenceId}</div>
          <div className="recut-scenes">
            {scenes.map((s) => (
              <div key={s.index} className="recut-scene-row">
                <span className="recut-scene-i">Cảnh {s.index + 1}</span>
                <span className="recut-scene-t">{s.durationSec.toFixed(1)}s</span>
                <span className="recut-scene-at">@{s.startSec.toFixed(1)}s</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {det?.sequenceId && (
        <Section title="Tái dựng — chống trùng" iconName="wand">
          <label className="recut-opt">
            <input
              type="checkbox"
              checked={optRename}
              onChange={(e) => setOptRename((e.target as HTMLInputElement).checked)}
            />
            <span>Đặt tên cảnh "Cảnh 1…N" (gọn timeline)</span>
          </label>
          <label className="recut-opt">
            <input
              type="checkbox"
              checked={optTrim}
              onChange={(e) => setOptTrim((e.target as HTMLInputElement).checked)}
            />
            <span>Tỉa đuôi mỗi cảnh</span>
            <input
              className="recut-num"
              type="number"
              step="0.05"
              min="0"
              value={trimSec}
              onChange={(e) => setTrimSec(Number((e.target as HTMLInputElement).value) || 0)}
              disabled={!optTrim}
            />
            <span className="recut-unit">giây</span>
          </label>
          <Button variant="primary" busy={applying} onClick={rebuild} iconName="check" full>
            {applying ? 'Đang tái dựng…' : 'Tái dựng'}
          </Button>
          <div className="recut-note">
            Đòn chống-trùng mạnh (tách/thay nhạc nền, tách voice, lật ngang, đổi tốc độ, đổi khung)
            chạy ở <b>chế độ Hàng loạt (headless)</b> — sắp có.
          </div>
        </Section>
      )}

      {dedup && (
        <Section title="Kết quả tái dựng" iconName="check">
          <div className="recut-result">
            Đã áp <Badge tone="success">{dedup.applied}</Badge> thao tác trên {dedup.sceneCount}{' '}
            cảnh.
            {dedup.checkpointId && <div className="recut-note">Mốc hoàn tác (Ctrl-Z để gỡ).</div>}
          </div>
          <div className="recut-steps">
            {dedup.steps.slice(0, 60).map((s, i) => (
              <div key={i} className={`recut-step${s.ok ? '' : ' bad'}`}>
                {s.ok ? '✓' : '✗'} {s.op}
                {s.error ? ` — ${s.error}` : ''}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

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

  // Lane B (headless FFmpeg) — recipe điều khiển được
  const [rFlip, setRFlip] = useState(true);
  const [rCrop, setRCrop] = useState(3);
  const [rSpeed, setRSpeed] = useState(1.05);
  const [rColor, setRColor] = useState(true);
  const [rGrain, setRGrain] = useState(6);
  const [rBgm, setRBgm] = useState<'keep' | 'strip' | 'replace'>('keep');
  const [batching, setBatching] = useState(false);
  const [batchRes, setBatchRes] = useState<{
    ok?: boolean;
    out_path?: string;
    applied?: string[];
    error?: string;
  } | null>(null);

  // Tách nhạc nền / voice (Demucs)
  const [separating, setSeparating] = useState(false);
  const [sep, setSep] = useState<{
    ok?: boolean;
    stems?: Record<string, string>;
    device?: string;
    error?: string;
  } | null>(null);

  const separate = async (): Promise<void> => {
    const path = videoPath.trim();
    if (!path) {
      setErr('Hãy nhập đường dẫn video.');
      return;
    }
    setErr(null);
    setSeparating(true);
    setSep(null);
    try {
      const r = await wsClient.call<typeof sep>('recut.separateAudio', {
        videoPath: path,
        mode: 'vocals',
      });
      setSep(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSeparating(false);
    }
  };

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

  const runBatch = async (): Promise<void> => {
    const path = videoPath.trim();
    if (!path) {
      setErr('Hãy nhập đường dẫn video.');
      return;
    }
    setErr(null);
    setBatching(true);
    setBatchRes(null);
    try {
      const r = await wsClient.call<typeof batchRes>('recut.batch.process', {
        videoPath: path,
        recipe: {
          flip: rFlip,
          crop_pct: rCrop,
          speed: rSpeed,
          saturation: rColor ? 1.08 : 1.0,
          grain: rGrain,
          bgm: rBgm,
        },
      });
      setBatchRes(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBatching(false);
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
        </Section>
      )}

      <Section title="Tách nhạc nền / voice (Demucs)" iconName="wand">
        <div className="recut-note">
          Tách audio thành <b>voice</b> (giọng) + <b>no_vocals</b> (nhạc nền). Đòn chống-trùng số 1
          (Content-ID là audio-first). Cần torch-CUDA (đang cài nếu chưa có).
        </div>
        <div className="recut-btnrow">
          <Button variant="secondary" busy={separating} onClick={separate} iconName="wand">
            {separating ? 'Đang tách…' : 'Tách nhạc nền'}
          </Button>
          <Button variant="secondary" busy={separating} onClick={separate} iconName="wand">
            Tách voice
          </Button>
        </div>
        {sep && (
          <div className="recut-result">
            {sep.ok ? (
              <>
                ✓ Tách xong ({sep.device}):
                {Object.entries(sep.stems ?? {}).map(([k, v]) => (
                  <div key={k} className="recut-note">
                    {k === 'vocals' ? '🎤 voice' : '🎵 nhạc nền'}: {v}
                  </div>
                ))}
              </>
            ) : (
              <span className="recut-step bad">
                Lỗi: {sep.error ?? 'không rõ (xem torch-CUDA)'}
              </span>
            )}
          </div>
        )}
      </Section>

      <Section title="Chống trùng mạnh (headless · không cần Premiere)" iconName="zap">
        <div className="recut-note">
          Render bản MỚI bằng FFmpeg theo công thức dưới (đòn phá pHash/Content-ID).
        </div>
        <label className="recut-opt">
          <input
            type="checkbox"
            checked={rFlip}
            onChange={(e) => setRFlip((e.target as HTMLInputElement).checked)}
          />
          <span>Lật ngang (mạnh nhất phá khung hình)</span>
        </label>
        <label className="recut-opt">
          <span>Crop-zoom</span>
          <input
            className="recut-num"
            type="number"
            step="1"
            min="0"
            max="10"
            value={rCrop}
            onChange={(e) => setRCrop(Number((e.target as HTMLInputElement).value) || 0)}
          />
          <span className="recut-unit">%</span>
        </label>
        <label className="recut-opt">
          <span>Đổi tốc độ</span>
          <input
            className="recut-num"
            type="number"
            step="0.01"
            min="0.9"
            max="1.15"
            value={rSpeed}
            onChange={(e) => setRSpeed(Number((e.target as HTMLInputElement).value) || 1)}
          />
          <span className="recut-unit">×</span>
        </label>
        <label className="recut-opt">
          <input
            type="checkbox"
            checked={rColor}
            onChange={(e) => setRColor((e.target as HTMLInputElement).checked)}
          />
          <span>Đổi màu nhẹ</span>
        </label>
        <label className="recut-opt">
          <span>Nhiễu (grain)</span>
          <input
            className="recut-num"
            type="number"
            step="1"
            min="0"
            max="20"
            value={rGrain}
            onChange={(e) => setRGrain(Number((e.target as HTMLInputElement).value) || 0)}
          />
        </label>
        <label className="recut-opt">
          <span>Nhạc nền</span>
          <select
            className="recut-num"
            value={rBgm}
            onChange={(e) =>
              setRBgm((e.target as HTMLSelectElement).value as 'keep' | 'strip' | 'replace')
            }
          >
            <option value="keep">Giữ nguyên</option>
            <option value="strip">Bỏ nhạc (giữ voice)</option>
            <option value="replace">Thay nhạc mới</option>
          </select>
        </label>
        <Button variant="primary" busy={batching} onClick={runBatch} iconName="zap" full>
          {batching ? 'Đang xử lý (FFmpeg)…' : 'Xử lý chống-trùng → xuất file mới'}
        </Button>
        {batchRes && (
          <div className="recut-result">
            {batchRes.ok ? (
              <>
                ✓ Xuất: <span className="recut-seqname">{batchRes.out_path}</span>
                <div className="recut-note">Đã áp: {(batchRes.applied ?? []).join(', ')}</div>
              </>
            ) : (
              <span className="recut-step bad">Lỗi: {batchRes.error ?? 'không rõ'}</span>
            )}
          </div>
        )}
      </Section>

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

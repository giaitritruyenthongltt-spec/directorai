/**
 * RecutTab — "Tách & Tái dựng" (Lane A, MVP).
 *
 * Đưa 1 video đã-dựng → "Phân mảnh cảnh" (Scene Edit Detection native) → sequence
 * cắt-cảnh editable → "Tái dựng" chống-trùng cơ bản (rename Cảnh N + tỉa đuôi).
 * Các đòn nặng (flip/crop/speed/tách BGM) thuộc Lane B (headless) — pha kế.
 */

import React, { useEffect, useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import { Section, Button, Badge, ErrorBox } from './ui/primitives.js';
import { HelpButton } from './HelpButton.js';
import './RecutTab.css';

interface Scene {
  index: number;
  startSec: number;
  durationSec: number;
  endSec?: number;
  thumb?: string | null;
}
interface SceneGroup {
  index: number;
  startSec: number;
  durationSec: number;
  shotCount: number;
  shotIndices: number[];
}
interface DetectResult {
  sequenceId?: string;
  sequenceName?: string;
  sceneCount?: number;
  scenes?: Scene[];
  groups?: SceneGroup[];
  detector?: string;
  fps?: number;
  method?: 'premiere' | 'analyze';
  error?: string;
}
type DetectMethod = 'premiere' | 'analyze';
type Detector = 'content' | 'adaptive';
const THR_DEFAULT: Record<Detector, number> = { content: 27, adaptive: 3 };
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

  // Phương pháp phân mảnh + độ-nhạy (tùy chỉnh được)
  const [method, setMethod] = useState<DetectMethod>('analyze');
  const [detector, setDetector] = useState<Detector>('adaptive');
  const [threshold, setThreshold] = useState<number>(THR_DEFAULT.adaptive);
  const [minLen, setMinLen] = useState<number>(1.0);
  const [thumbs, setThumbs] = useState<boolean>(true);
  const [groupOn, setGroupOn] = useState<boolean>(false);

  const changeDetector = (d: Detector): void => {
    setDetector(d);
    setThreshold(THR_DEFAULT[d]); // đổi ngưỡng mặc định theo detector
  };

  // Checklist tái dựng
  const [optRename, setOptRename] = useState(true);
  const [optTrim, setOptTrim] = useState(false);
  const [trimSec, setTrimSec] = useState(0.15);
  const [applying, setApplying] = useState(false);
  const [dedup, setDedup] = useState<DedupResult | null>(null);

  // R4 — cut-list → FCPXML editable
  const [cutlistBusy, setCutlistBusy] = useState(false);
  const [cutlistRes, setCutlistRes] = useState<{ path?: string; clips?: number } | null>(null);

  // Lane B (headless FFmpeg) — recipe điều khiển được
  const [rFlip, setRFlip] = useState(true);
  const [rCrop, setRCrop] = useState(3);
  const [rSpeed, setRSpeed] = useState(1.05);
  const [rColor, setRColor] = useState(true);
  const [rGrain, setRGrain] = useState(6);
  const [rBgm, setRBgm] = useState<'keep' | 'strip' | 'replace'>('keep');
  const [rNewBgm, setRNewBgm] = useState(''); // đường dẫn nhạc mới (khi replace)
  const [batching, setBatching] = useState(false);
  const [batchRes, setBatchRes] = useState<{
    ok?: boolean;
    out_path?: string;
    applied?: string[];
    error?: string;
  } | null>(null);

  // R1+R3 — Xử lý cả thư mục (hàng loạt) + tiến độ + hủy
  const [folder, setFolder] = useState('');
  const [recursive, setRecursive] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [folderRunning, setFolderRunning] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; label?: string } | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const [folderRes, setFolderRes] = useState<{
    total?: number;
    done?: number;
    failed?: number;
    skipped?: number;
    cancelled?: boolean;
    outDir?: string;
    files?: { src: string; ok: boolean; skipped?: boolean; error?: string }[];
  } | null>(null);

  // Lắng tiến độ batch từ server (ProgressBus → notification).
  useEffect(() => {
    const off = wsClient.onProgress((evt) => {
      if (evt.kind === 'start' && evt.method === 'recut.batch.folder') {
        setOpId(evt.opId);
        setProg({ done: 0, total: evt.total ?? 0 });
      } else if (evt.kind === 'update') {
        setOpId((cur) => {
          if (cur && evt.opId === cur)
            setProg({ done: evt.done ?? 0, total: evt.total ?? 0, label: evt.label });
          return cur;
        });
      } else if (evt.kind === 'end') {
        setOpId((cur) => (evt.opId === cur ? null : cur));
      }
    });
    return off;
  }, []);

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
    setCutlistRes(null); // B7 — bỏ kết quả FCPXML cũ khi phân mảnh lại
    const path = videoPath.trim();
    if (!path) {
      setErr('Hãy nhập đường dẫn video (vd E:\\T11\\tap1.mp4).');
      return;
    }
    setDetecting(true);
    try {
      if (method === 'analyze') {
        // Đường SIDECAR (PySceneDetect) — chọn detector + ngưỡng + xem-trước.
        const r = await wsClient.call<DetectResult>('recut.detectScenesSidecar', {
          videoPath: path,
          detector,
          threshold,
          minSceneLenSec: minLen,
          thumbnails: thumbs,
          group: groupOn,
        });
        setDet({ ...r, method: 'analyze' });
      } else {
        // Đường PREMIERE (native SED) — giữ sequence editable cho "Tái dựng".
        const r = await wsClient.call<DetectResult>('recut.detectScenes', { videoPath: path });
        if (r?.error) setErr(r.error);
        setDet({ ...r, method: 'premiere' });
      }
    } catch (e) {
      setErr(`[Phân mảnh] ${e instanceof Error ? e.message : String(e)}`);
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
        recipe: recipeFromUI(),
      });
      setBatchRes(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBatching(false);
    }
  };

  const recipeFromUI = (): Record<string, unknown> => ({
    flip: rFlip,
    crop_pct: rCrop,
    speed: rSpeed,
    saturation: rColor ? 1.08 : 1.0,
    grain: rGrain,
    bgm: rBgm,
    new_bgm_path: rBgm === 'replace' && rNewBgm.trim() ? rNewBgm.trim() : undefined,
  });

  const runBatchFolder = async (): Promise<void> => {
    const f = folder.trim();
    if (!f) {
      setErr('Hãy nhập đường dẫn thư mục chứa các tập video.');
      return;
    }
    setErr(null);
    setFolderRunning(true);
    setFolderRes(null);
    setProg({ done: 0, total: 0 });
    try {
      // call() không đặt timeout client → batch nhiều giờ vẫn chờ kết quả OK.
      const r = await wsClient.call<typeof folderRes>('recut.batch.folder', {
        folder: f,
        recursive,
        skipExisting,
        recipe: recipeFromUI(),
      });
      setFolderRes(r);
    } catch (e) {
      setErr(`[Hàng loạt] ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFolderRunning(false);
      setProg(null);
    }
  };

  const cancelBatch = async (): Promise<void> => {
    if (opId) await wsClient.cancelOp(opId);
  };

  const buildCutList = async (): Promise<void> => {
    const path = videoPath.trim();
    const sc = det?.scenes ?? [];
    if (!path || sc.length === 0) return;
    setErr(null);
    setCutlistBusy(true);
    setCutlistRes(null);
    try {
      const r = await wsClient.call<{ path?: string; clips?: number }>('recut.buildCutListFcpxml', {
        videoPath: path,
        scenes: sc.map((s) => ({ startSec: s.startSec, durationSec: s.durationSec })),
      });
      setCutlistRes(r);
    } catch (e) {
      setErr(`[FCPXML] ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCutlistBusy(false);
    }
  };

  const scenes = det?.scenes ?? [];
  const pct = prog && prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;

  return (
    <div className="recut-tab">
      <Section title="Nguồn video (đã dựng)" iconName="film">
        <div className="recut-help">
          <span>Đưa 1 video cũ đã hoàn thiện vào để tách lại các cảnh, tái dựng bản mới.</span>
          <HelpButton
            title="Tách & Tái dựng"
            lines={[
              'Phân mảnh KHÔNG ngẫu nhiên: cắt tại nơi khung hình thay đổi đột ngột (đúng điểm cắt người dựng).',
              '"Phân tích (tùy chỉnh)": chọn Adaptive (bền chuyển động Nerf) / Content, chỉnh độ nhạy, XEM TRƯỚC bằng ảnh.',
              '"Premiere (native)": tạo sequence editable để bấm "Tái dựng" (đổi tên cảnh + tỉa đuôi).',
              'Đòn nặng (tách nhạc/voice, lật, đổi tốc độ) ở mục "Chống trùng mạnh" — chạy headless bằng FFmpeg/Demucs.',
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

        <div className="recut-method">
          <button className={method === 'analyze' ? 'on' : ''} onClick={() => setMethod('analyze')}>
            Phân tích (tùy chỉnh)
            <small>xem trước + chọn độ nhạy</small>
          </button>
          <button
            className={method === 'premiere' ? 'on' : ''}
            onClick={() => setMethod('premiere')}
          >
            Premiere (native)
            <small>tạo sequence để Tái dựng</small>
          </button>
        </div>

        {method === 'analyze' && (
          <div className="recut-tune">
            <label className="recut-opt">
              <span>Thuật toán</span>
              <select
                className="recut-select"
                value={detector}
                onChange={(e) => changeDetector((e.target as HTMLSelectElement).value as Detector)}
              >
                <option value="adaptive">Adaptive — bền chuyển động (Nerf)</option>
                <option value="content">Content — ngưỡng cố định</option>
              </select>
            </label>
            <label className="recut-opt">
              <span>Độ nhạy</span>
              <input
                className="recut-num"
                type="number"
                step={detector === 'adaptive' ? '0.5' : '1'}
                min="0"
                value={threshold}
                onChange={(e) => setThreshold(Number((e.target as HTMLInputElement).value) || 0)}
              />
              <span className="recut-unit">
                {detector === 'adaptive' ? 'thấp = cắt nhiều' : '27≈chuẩn, thấp = nhạy'}
              </span>
            </label>
            <label className="recut-opt">
              <span>Cảnh tối thiểu</span>
              <input
                className="recut-num"
                type="number"
                step="0.1"
                min="0"
                value={minLen}
                onChange={(e) => setMinLen(Number((e.target as HTMLInputElement).value) || 0)}
              />
              <span className="recut-unit">giây (gộp cảnh ngắn hơn)</span>
            </label>
            <label className="recut-opt">
              <input
                type="checkbox"
                checked={thumbs}
                onChange={(e) => setThumbs((e.target as HTMLInputElement).checked)}
              />
              <span>Kèm ảnh xem-trước điểm cắt</span>
            </label>
            <label className="recut-opt">
              <input
                type="checkbox"
                checked={groupOn}
                onChange={(e) => setGroupOn((e.target as HTMLInputElement).checked)}
              />
              <span>Gom shot → cảnh ngữ-nghĩa (cùng bối cảnh)</span>
            </label>
          </div>
        )}

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
          <div className="recut-seqname">
            {det.method === 'analyze'
              ? `Thuật toán: ${det.detector ?? detector}${det.fps ? ` · ${det.fps.toFixed(2)} fps` : ''} · không ngẫu nhiên — cắt theo thay-đổi khung hình`
              : `Sequence: ${det.sequenceName ?? det.sequenceId}`}
          </div>
          {det.groups && det.groups.length > 0 && (
            <div className="recut-groupwrap">
              <div className="recut-note">
                Gom <Badge tone="accent">{det.groups.length}</Badge> cảnh ngữ-nghĩa từ{' '}
                {scenes.length} shot:
              </div>
              <div className="recut-groups">
                {det.groups.map((g) => (
                  <div key={g.index} className="recut-group-row">
                    <span className="recut-scene-i">
                      Cảnh {g.index + 1} ({g.shotCount} shot)
                    </span>
                    <span className="recut-scene-t">{g.durationSec.toFixed(1)}s</span>
                    <span className="recut-scene-at">@{g.startSec.toFixed(1)}s</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {scenes.some((s) => s.thumb) ? (
            <div className="recut-grid">
              {scenes.map((s) => (
                <div key={s.index} className="recut-card">
                  {s.thumb ? (
                    <img src={s.thumb} alt={`Cảnh ${s.index + 1}`} loading="lazy" />
                  ) : (
                    <div style={{ aspectRatio: '16 / 9', background: '#000' }} />
                  )}
                  <div className="recut-card-meta">
                    <span className="i">#{s.index + 1}</span>
                    <span className="d">{s.durationSec.toFixed(1)}s</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="recut-scenes">
              {scenes.map((s) => (
                <div key={s.index} className="recut-scene-row">
                  <span className="recut-scene-i">Cảnh {s.index + 1}</span>
                  <span className="recut-scene-t">{s.durationSec.toFixed(1)}s</span>
                  <span className="recut-scene-at">@{s.startSec.toFixed(1)}s</span>
                </div>
              ))}
            </div>
          )}
          {det.method === 'analyze' && scenes.length > 0 && (
            <div className="recut-cutlist">
              <div className="recut-note">
                Biến cut-list này thành <b>sequence editable</b> trong Premiere: tạo file FCPXML (1
                nguồn tách {scenes.length} đoạn đúng điểm cắt) → <b>File ▸ Import</b> vào Premiere.
              </div>
              <Button
                variant="secondary"
                busy={cutlistBusy}
                onClick={buildCutList}
                iconName="film"
                full
              >
                {cutlistBusy ? 'Đang tạo FCPXML…' : 'Tạo FCPXML editable (import vào Premiere)'}
              </Button>
              {cutlistRes?.path && (
                <div className="recut-result">
                  ✓ Đã tạo <Badge tone="success">{cutlistRes.clips ?? scenes.length}</Badge> cảnh.
                  <div className="recut-note">
                    File: {cutlistRes.path} — mở Premiere ▸ File ▸ Import file này.
                  </div>
                </div>
              )}
            </div>
          )}
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
        <Button variant="secondary" busy={separating} onClick={separate} iconName="wand" full>
          {separating ? 'Đang tách…' : 'Tách giọng & nhạc nền (Demucs)'}
        </Button>
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
        {rBgm === 'replace' && (
          <input
            className="recut-input"
            type="text"
            placeholder="Đường dẫn nhạc nền mới (mp3/wav) — bỏ trống = bỏ nhạc"
            value={rNewBgm}
            onChange={(e) => setRNewBgm((e.target as HTMLInputElement).value)}
          />
        )}
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

      <Section title="Xử lý cả thư mục (hàng loạt · 3000 tập)" iconName="layers">
        <div className="recut-note">
          Quét cả thư mục → tự dedup TỪNG tập theo công thức ở trên (FFmpeg/Demucs, không cần
          Premiere). File ra ở <code>_recut_out</code>. Bỏ qua tập đã làm, lỗi 1 tập vẫn chạy tiếp.
        </div>
        <input
          className="recut-input"
          type="text"
          placeholder="D:\NerfArchive\Season1"
          value={folder}
          onChange={(e) => setFolder((e.target as HTMLInputElement).value)}
        />
        <label className="recut-opt">
          <input
            type="checkbox"
            checked={recursive}
            onChange={(e) => setRecursive((e.target as HTMLInputElement).checked)}
          />
          <span>Quét cả thư mục con</span>
        </label>
        <label className="recut-opt">
          <input
            type="checkbox"
            checked={skipExisting}
            onChange={(e) => setSkipExisting((e.target as HTMLInputElement).checked)}
          />
          <span>Bỏ qua tập đã có output (chạy tiếp lần sau)</span>
        </label>
        {folderRunning && prog ? (
          <div className="recut-progress">
            <div className="recut-progress-bar">
              <div className="recut-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="recut-progress-row">
              <span>
                {prog.done}/{prog.total} ({pct}%){prog.label ? ` · ${prog.label}` : ''}
              </span>
              <Button variant="secondary" onClick={cancelBatch} iconName="x">
                Hủy
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            busy={folderRunning}
            onClick={runBatchFolder}
            iconName="layers"
            full
          >
            Xử lý cả thư mục
          </Button>
        )}
        {folderRes && folderRes.total === 0 && (
          <div className="recut-result">
            ⚠️ Không tìm thấy video nào trong thư mục (kiểm tra đường dẫn / bật "thư mục con").
          </div>
        )}
        {folderRes && (folderRes.total ?? 0) > 0 && (
          <div className="recut-result">
            {folderRes.cancelled ? '⏹ Đã hủy. ' : '✓ Xong. '}
            <Badge tone="success">{folderRes.done ?? 0}</Badge> ok ·{' '}
            <Badge tone="warn">{folderRes.skipped ?? 0}</Badge> bỏ qua ·{' '}
            <Badge tone="error">{folderRes.failed ?? 0}</Badge> lỗi / {folderRes.total ?? 0} tập.
            <div className="recut-note">Output: {folderRes.outDir}</div>
            <div className="recut-steps">
              {(folderRes.files ?? [])
                .filter((f) => !f.ok || f.error)
                .slice(0, 40)
                .map((f, i) => (
                  <div key={i} className="recut-step bad">
                    ✗ {f.src} — {f.error ?? 'lỗi'}
                  </div>
                ))}
            </div>
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

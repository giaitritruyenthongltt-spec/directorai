/**
 * Tab Nâng cao — điều khiển bộ máy ngữ cảnh (Python context-engine) cho media.
 *
 * R5 (UI redesign) — Việt hóa toàn bộ + icon SVG + bố cục thẻ (card). Trước
 * đây tab này còn tiếng Anh, nút phẳng xám, trống trải → trông "basic".
 *
 * Luồng: kiểm tra sức khỏe sidecar khi (re)connect → nhập đường dẫn media →
 * chọn thao tác (nạp/bóc lời/tách cảnh/dò nhịp/phân tích hình) → kết quả JSON.
 */

import React, { useEffect, useState } from 'react';
import { wsClient } from '../bridge/ws-client.js';
import { useSession } from '../state/session.js';
import { Icon, type IconName } from './Icon.js';
import { ClickBox } from './ui/primitives.js';
import './ContextTab.css';

interface Health {
  status: string;
  version: string;
}

/** Mô tả 1 thao tác phân tích (nhãn VN + icon + hàm gọi). */
interface CtxAction {
  key: string;
  label: string;
  icon: IconName;
  hint: string;
  run: (mediaPath: string) => Promise<unknown>;
}

const ACTIONS: CtxAction[] = [
  {
    key: 'ingest',
    label: 'Nạp toàn bộ',
    icon: 'layers',
    hint: 'Bóc lời thoại + tách cảnh trong 1 lần',
    run: (m) =>
      wsClient.call('context.ingest', {
        media_path: m,
        enable_transcribe: true,
        enable_scene: true,
        enable_beat: false,
        enable_vision: false,
      }),
  },
  {
    key: 'transcribe',
    label: 'Bóc lời thoại',
    icon: 'mic',
    hint: 'Whisper → phụ đề/transcript theo thời gian',
    run: (m) => wsClient.call('context.transcribe', { media_path: m }),
  },
  {
    key: 'scenes',
    label: 'Tách cảnh',
    icon: 'scissors',
    hint: 'Phát hiện ranh giới cảnh (scene cut)',
    run: (m) => wsClient.call('context.findScenes', { media_path: m }),
  },
  {
    key: 'beats',
    label: 'Dò nhịp nhạc',
    icon: 'music',
    hint: 'Tìm beat để cắt theo nhạc',
    run: (m) => wsClient.call('context.findBeats', { media_path: m }),
  },
  {
    key: 'visual',
    label: 'Phân tích hình ảnh',
    icon: 'eye',
    hint: 'AI hiểu nội dung khung hình',
    run: (m) => wsClient.call('context.analyzeVisual', { media_path: m }),
  },
];

export function ContextTab(): React.ReactElement {
  const { conn } = useSession();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [mediaPath, setMediaPath] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  // Kiểm tra health LẠI mỗi khi (re)connect, không chỉ 1 lần lúc mount.
  useEffect(() => {
    if (conn !== 'connected') return;
    void (async () => {
      try {
        const h = await wsClient.call<Health>('context.health');
        setHealth(h);
        setHealthErr(null);
      } catch (e) {
        setHealthErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [conn]);

  const run = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(label);
    setError(null);
    setResult(null);
    try {
      setResult(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const callSearch = (): Promise<void> =>
    run('Đang tìm', () => wsClient.call('context.searchClips', { query, top_k: 10 }));

  const canRun = mediaPath.trim().length > 0 && !busy;
  const canSearch = query.trim().length > 0 && !busy;

  return (
    <div className="context-tab">
      <div className="ctx-head">
        <div className="ctx-title">
          <Icon name="sliders" size={18} />
          <div>
            <h3>Bộ máy ngữ cảnh</h3>
            <p className="ctx-subtitle">Phân tích sâu media: lời thoại · cảnh · nhịp · hình ảnh</p>
          </div>
        </div>
        {health ? (
          <span className="ctx-health ok">
            <span className="ctx-health-dot" /> Sẵn sàng · v{health.version}
          </span>
        ) : healthErr ? (
          <span className="ctx-health err">
            <Icon name="alert" size={13} /> Không kết nối được sidecar
          </span>
        ) : (
          <span className="ctx-health">
            <Icon name="refresh" size={13} className="spin" /> Đang kiểm tra…
          </span>
        )}
      </div>

      <section className="ctx-card">
        <div className="ctx-card-label">
          <Icon name="folder" size={14} /> Đường dẫn media
        </div>
        <input
          className="ctx-input"
          type="text"
          placeholder="C:\Footage\hero.mp4"
          value={mediaPath}
          onChange={(e) => setMediaPath(e.target.value)}
        />
        <div className="ctx-actions">
          {ACTIONS.map((a) => (
            <ClickBox
              key={a.key}
              className="ctx-action-btn"
              disabled={!canRun}
              title={a.hint}
              onClick={() => void run(a.label, () => a.run(mediaPath))}
            >
              <Icon name={a.icon} size={16} />
              <span>{a.label}</span>
            </ClickBox>
          ))}
        </div>
      </section>

      <section className="ctx-card">
        <div className="ctx-card-label">
          <Icon name="search" size={14} /> Tìm trong clip (theo ngữ nghĩa)
        </div>
        <div className="ctx-search-row">
          <input
            className="ctx-input"
            type="text"
            placeholder="vd: đoạn nói về pha bắn trúng quyết định"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSearch) void callSearch();
            }}
          />
          <ClickBox
            className="ctx-search-btn"
            disabled={!canSearch}
            onClick={() => void callSearch()}
          >
            <Icon name="search" size={15} />
            Tìm
          </ClickBox>
        </div>
      </section>

      {busy && (
        <div className="ctx-busy">
          <Icon name="refresh" size={15} className="spin" /> {busy}…
        </div>
      )}
      {error && (
        <div className="ctx-error">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}
      {result !== null && (
        <section className="ctx-card">
          <div className="ctx-card-label">
            <Icon name="list" size={14} /> Kết quả
          </div>
          <pre className="ctx-result">{JSON.stringify(result, null, 2).slice(0, 4000)}</pre>
        </section>
      )}
      {result === null && !busy && !error && (
        <div className="ctx-empty">
          <Icon name="layers" size={28} />
          <p>Nhập đường dẫn media rồi chọn một thao tác phân tích ở trên.</p>
        </div>
      )}
    </div>
  );
}

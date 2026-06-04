import React, { useEffect, useState } from 'react';
import type { ConnectionState } from '../bridge/ws-client.js';
import { wsClient } from '../bridge/ws-client.js';
import { isInUXP, readActiveContext } from '../bridge/uxp-api.js';
import { Icon } from './Icon.js';
import './StatusBar.css';

interface Props {
  connState: ConnectionState;
}

/**
 * Thanh trạng thái — lấy tên dự án + sequence từ MÁY CHỦ qua WS (không
 * gọi UXP trực tiếp, vì Premiere 26 trả về Promise nên gọi sync sẽ luôn
 * cho "No project"). Cập nhật mỗi 3 giây khi đã kết nối.
 */
export function StatusBar({ connState }: Props): React.ReactElement {
  const [project, setProject] = useState<string>('—');
  const [sequence, setSequence] = useState<string>('—');

  useEffect(() => {
    if (connState !== 'connected') {
      setProject('—');
      setSequence('—');
      return;
    }
    let alive = true;
    const poll = async (): Promise<void> => {
      // D5 — Trong UXP: đọc THẲNG active project/sequence từ panel (server
      // không tự-forward về chính panel đang hỏi → trước đây rơi "mock").
      if (isInUXP) {
        const ctx = await readActiveContext();
        if (ctx) {
          if (alive) {
            setProject(ctx.project);
            setSequence(ctx.sequence);
          }
          return;
        }
        // readActiveContext null → ngã sang WS bên dưới.
      }
      try {
        const seq = await wsClient.call<{ name?: string } | null>('project.getActiveSequence');
        if (alive) setSequence(seq?.name ?? 'Chưa có sequence');
      } catch {
        if (alive) setSequence('—');
      }
      try {
        const proj = await wsClient.call<{ metadata?: { name?: string } }>('project.get');
        if (alive) setProject(proj?.metadata?.name ?? 'Chưa có dự án');
      } catch {
        if (alive) setProject('—');
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [connState]);

  const connLabel =
    connState === 'connected' ? 'sẵn sàng' : connState === 'connecting' ? 'đang kết nối' : 'ngắt';

  return (
    <div className="status-bar">
      <span className="status-item">
        <Icon name={isInUXP ? 'zap' : 'layers'} size={12} /> {isInUXP ? 'Premiere' : 'Giả lập'}
      </span>
      <span className="status-sep">|</span>
      <span className="status-item" title="Dự án đang mở">
        <Icon name="folder" size={12} /> {project}
      </span>
      <span className="status-sep">|</span>
      <span className="status-item" title="Sequence đang chọn">
        <Icon name="film" size={12} /> {sequence}
      </span>
      <span className="status-sep">|</span>
      <span className="status-item" style={{ opacity: 0.6 }}>
        {connLabel}
      </span>
    </div>
  );
}

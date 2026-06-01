import React, { useEffect, useState } from 'react';
import type { ConnectionState } from '../bridge/ws-client.js';
import { wsClient } from '../bridge/ws-client.js';
import { isInUXP } from '../bridge/uxp-api.js';
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
      <span className="status-item">{isInUXP ? '⚡ Premiere' : '🔷 Giả lập'}</span>
      <span className="status-sep">|</span>
      <span className="status-item" title="Dự án đang mở">
        📁 {project}
      </span>
      <span className="status-sep">|</span>
      <span className="status-item" title="Sequence đang chọn">
        🎬 {sequence}
      </span>
      <span className="status-sep">|</span>
      <span className="status-item" style={{ opacity: 0.6 }}>
        {connLabel}
      </span>
    </div>
  );
}

/**
 * R3 — Khối "Nguồn clip" DÙNG CHUNG. Đọc/ghi state phiên (useSession) nên map
 * 1 lần ở bất kỳ tab nào → mọi tab thấy, đổi tab KHÔNG mất. Nhúng vào FilmTab,
 * AutoTab, AnalysisTab… để mọi tab đều có chức năng lấy path như nhau.
 */

import React from 'react';
import { useSession } from '../state/session.js';
import { Section, Button, Badge, EmptyState } from './ui/primitives.js';
import { ClipTable } from './ClipTable.js';

export function ClipSourcePanel(props: { title?: string }): React.ReactElement {
  const s = useSession();

  return (
    <Section title={props.title ?? '1. Nguồn clip'} icon="🎞️">
      <div className="film-row">
        <Button onClick={() => void s.loadClips()} busy={s.loadingClips}>
          🔄 Nạp lại từ sequence
        </Button>
        <Button variant="primary" onClick={() => void s.resolveFromProject()} busy={s.loadingClips}>
          🎯 Lấy path tự động (từ project)
        </Button>
        {s.seqName && (
          <Badge tone="accent" title="Sequence đang mở">
            {s.seqName} · {s.clips.length} clip
          </Badge>
        )}
        {s.clips.length > 0 && (
          <Badge tone={s.resolvedCount ? 'success' : 'warn'}>
            {s.resolvedCount}/{s.clips.length} có path
          </Badge>
        )}
      </div>

      <details className="film-folder-adv">
        <summary>… hoặc Quét thư mục gốc (nếu cách trên thiếu clip)</summary>
        <div className="film-folder">
          <textarea
            className="film-folderbox"
            placeholder="Dán thư mục gốc (mỗi dòng 1 folder: video/nhạc/hiệu ứng) rồi Quét…"
            value={s.folderText}
            onChange={(e) => s.setFolderText(e.target.value)}
            rows={2}
          />
          <Button onClick={() => void s.scanFolders()} busy={s.loadingClips}>
            🔍 Quét thư mục → map path
          </Button>
        </div>
      </details>

      {s.clipError && <div className="ui-error">⚠️ {s.clipError}</div>}

      {s.clips.length > 0 ? (
        <ClipTable clips={s.clips} />
      ) : s.conn !== 'connected' ? (
        <EmptyState
          icon="🔌"
          title="Đang kết nối Premiere…"
          hint="Chờ panel kết nối rồi tự nạp clip. Nếu lâu, bấm Nạp lại."
        />
      ) : (
        <EmptyState
          icon="📭"
          title="Chưa có clip"
          hint="Mở 1 sequence trong Premiere rồi bấm Nạp lại."
        />
      )}
    </Section>
  );
}

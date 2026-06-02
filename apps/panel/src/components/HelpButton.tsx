/**
 * HelpButton — nút hướng dẫn tiếng Việt có thể tái sử dụng.
 *
 * Bấm vào dấu "?" để mở/đóng một thẻ giải thích ngay bên dưới. Mỗi mục
 * trong giao diện đều dùng component này để người dùng hiểu rõ chức năng.
 */

import React, { useState } from 'react';
import './HelpButton.css';

interface Props {
  /** Tiêu đề ngắn của phần hướng dẫn. */
  title: string;
  /** Nội dung hướng dẫn — có thể nhiều dòng (mỗi phần tử là 1 đoạn). */
  lines: readonly string[];
  /** Ví dụ minh hoạ (tuỳ chọn). */
  example?: string;
}

export function HelpButton({ title, lines, example }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-wrap">
      <button
        type="button"
        className={`help-btn ${open ? 'open' : ''}`}
        onClick={(e) => {
          // Chặn bubble: nếu HelpButton nằm trong <label> (vd thẻ module ở
          // AutoTab), click "?" KHÔNG được toggle checkbox của label đó.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={`Hướng dẫn: ${title}`}
        title="Xem hướng dẫn"
      >
        ?
      </button>
      {open && (
        <div className="help-popover" role="tooltip">
          <div className="help-popover-title">💡 {title}</div>
          {lines.map((l, i) => (
            <p key={i} className="help-popover-line">
              {l}
            </p>
          ))}
          {example && (
            <div className="help-popover-example">
              <span className="help-popover-example-label">Ví dụ:</span> {example}
            </div>
          )}
          <button type="button" className="help-popover-close" onClick={() => setOpen(false)}>
            Đã hiểu
          </button>
        </div>
      )}
    </span>
  );
}

/**
 * WorkflowDiagram — sơ đồ vận hành 4 bước.
 *
 * Hiển thị quy trình từ lúc bạn mô tả mong muốn đến khi AI dựng xong.
 * Có thể thu gọn để tiết kiệm không gian.
 */

import React, { useState } from 'react';
import './WorkflowDiagram.css';

interface Step {
  icon: string;
  title: string;
  desc: string;
}

const STEPS: readonly Step[] = [
  {
    icon: '✍️',
    title: '1. Mô tả',
    desc: 'Bạn chọn mục tiêu + phong cách video mong muốn',
  },
  {
    icon: '🤖',
    title: '2. AI lập kế hoạch',
    desc: 'AI phân tích và tạo kế hoạch dựng từng bước',
  },
  {
    icon: '👀',
    title: '3. Xem & duyệt',
    desc: 'Bạn xem trước các bước, chỉnh sửa nếu cần',
  },
  {
    icon: '🎬',
    title: '4. AI thực thi',
    desc: 'AI tự động cắt, ghép, chỉnh màu trên timeline',
  },
];

interface Props {
  /** Bước đang chạy (1-4), để highlight. 0 = chưa bắt đầu. */
  activeStep?: number;
}

export function WorkflowDiagram({ activeStep = 0 }: Props): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="wf-diagram">
      <button
        type="button"
        className="wf-header"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span className="wf-header-title">🗺️ Sơ đồ vận hành</span>
        <span className="wf-header-toggle">{collapsed ? '▼ Mở' : '▲ Thu gọn'}</span>
      </button>

      {!collapsed && (
        <div className="wf-steps">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const state =
              activeStep === 0
                ? 'idle'
                : n < activeStep
                  ? 'done'
                  : n === activeStep
                    ? 'active'
                    : 'idle';
            return (
              <React.Fragment key={s.title}>
                <div className={`wf-step ${state}`}>
                  <div className="wf-step-icon">{s.icon}</div>
                  <div className="wf-step-body">
                    <div className="wf-step-title">{s.title}</div>
                    <div className="wf-step-desc">{s.desc}</div>
                  </div>
                </div>
                {i < STEPS.length - 1 && <div className="wf-arrow">↓</div>}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

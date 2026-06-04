/**
 * Icon — hệ icon cho UXP (Premiere).
 *
 * ĐÃ THỬ & THẤT BẠI trong UXP: (1) <svg> nội tuyến → ô vuông đen; (2)
 * mask-image data-URI → ô vuông đặc; (3) <img src="data:..."> → TRẮNG vì
 * manifest UXP v5 CHẶN data: URI.
 *
 * CÁCH CHẠY ĐƯỢC (như icons/icon23.png của panel): FILE ẢNH CỤC BỘ. Các .svg
 * được sinh ra đĩa bởi tools/gen-ui-icons.mjs → apps/panel/icons/ui/, copy vào
 * dist/icons/ui/ qua CopyWebpackPlugin → <img src="icons/ui/<name>.svg">.
 *
 * Hệ quả: icon ĐƠN SẮC (màu nướng trong file). Trạng thái active hiển thị qua
 * nhãn/underline (đã có), không qua màu icon.
 */

import React from 'react';

export type IconName =
  | 'film'
  | 'zap'
  | 'report'
  | 'clapperboard'
  | 'chat'
  | 'sliders'
  | 'search'
  | 'folder'
  | 'scan'
  | 'sparkles'
  | 'eye'
  | 'check'
  | 'play'
  | 'refresh'
  | 'alert'
  | 'x'
  | 'target'
  | 'mic'
  | 'scissors'
  | 'music'
  | 'image'
  | 'send'
  | 'chevronDown'
  | 'chevronRight'
  | 'wand'
  | 'list'
  | 'clock'
  | 'help'
  | 'palette'
  | 'layers'
  | 'trash'
  | 'info'
  | 'pause'
  | 'stop';

export interface IconProps {
  name: IconName;
  /** px — mặc định 16 (ăn theo font-size dòng). */
  size?: number;
  className?: string;
  /** Giữ tương thích API (không còn tác dụng — màu nướng trong file SVG). */
  strokeWidth?: number;
  color?: string;
}

export function Icon({ name, size = 16, className }: IconProps): React.ReactElement {
  return (
    <img
      className={`icon${className ? ` ${className}` : ''}`}
      src={`icons/ui/${name}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

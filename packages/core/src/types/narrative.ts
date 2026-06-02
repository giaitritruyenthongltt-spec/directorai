/**
 * DM1 — Kiểu dữ liệu TỰ SỰ cho phim dài (long-form / điện ảnh).
 *
 * Pivot từ "montage 45s" sang "phim Nerf có cốt truyện": cần tổ chức hàng
 * trăm clip thành CHƯƠNG (act/chapter) → ĐOẠN (segment có mục đích) → clip.
 * Tất cả là kiểu thuần (không phụ thuộc adapter) để dùng chung core/server/
 * panel/sidecar.
 */

import type { Seconds } from './time.js';

/** Loại cảnh do Vision phân loại — dùng cho nhịp & sắp xếp tự sự. */
export type SceneClass =
  | 'establishing'
  | 'action'
  | 'reaction'
  | 'dialogue'
  | 'transition'
  | 'setup'
  | 'closeup'
  | 'landscape'
  | 'montage'
  | 'static';

/** Cảm xúc chủ đạo của clip/đoạn — phục vụ mạch cảm xúc phim dài. */
export type Emotion = 'tense' | 'fun' | 'intense' | 'calm' | 'neutral' | 'sad' | 'triumphant';

/** Mục đích tự sự của một ĐOẠN trong phim (cấu trúc 3 hồi mở rộng). */
export type SegmentPurpose =
  | 'intro'
  | 'establishing'
  | 'buildup'
  | 'action'
  | 'climax'
  | 'resolution'
  | 'comedy'
  | 'transition'
  | 'outro';

/** Hồ sơ nhịp của một chương/đoạn — đường cong năng lượng theo thời lượng. */
export type PacingProfile = 'slow' | 'balanced' | 'fast' | 'cinematic' | 'build' | 'wind_down';

/**
 * Một CHƯƠNG (act/chapter) — đơn vị tổ chức lớn nhất của phim dài. Ánh xạ
 * tới chapter-marker trên timeline Premiere (DM2/DM3).
 */
export interface Chapter {
  readonly id: string;
  readonly name: string;
  readonly start: Seconds;
  readonly end: Seconds;
  /** Màu hiển thị (hex) — đồng bộ với marker color nếu có. */
  readonly color?: string;
  /** Nhịp mong muốn của chương (cho planner). */
  readonly pacing?: PacingProfile;
}

/**
 * Một ĐOẠN (segment) — nhóm clip cùng mục đích tự sự; có thể thuộc 1 chương.
 * Là tầng giữa giữa Chapter và Clip, do AI sinh (video_map.segments).
 */
export interface Segment {
  readonly id: string;
  readonly name: string;
  readonly purpose: SegmentPurpose;
  readonly clipIds: readonly string[];
  readonly chapterId?: string;
  readonly description?: string;
}

/**
 * Metadata phân tích cho 1 clip (cache từ Vision/CV — agent #4 đề xuất để
 * không re-score). Đính kèm Clip dưới dạng optional.
 */
export interface ClipMetadata {
  readonly sceneClass?: SceneClass;
  /** Điểm chuyển động 0–1 (CV). */
  readonly motion?: number;
  /** Điểm chất lượng tổng hợp 0–1 (blur/exposure/framing). */
  readonly quality?: number;
  readonly emotion?: Emotion;
  /** Khoảnh khắc đắt (trúng đạn/né/ngắm/ăn mừng…). */
  readonly isKeyMoment?: boolean;
  readonly keyMomentType?: string;
}

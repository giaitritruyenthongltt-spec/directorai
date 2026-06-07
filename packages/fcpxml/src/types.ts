/**
 * @directorai/fcpxml — Kiểu cho timeline FCPXML (Tầng 4).
 *
 * FCPXML cho phép làm những thứ Premiere 26 UXP KHÔNG ghi được: dựng
 * sequence từ đầu (insert), cắt-đôi (split → 2 asset-clip), đổi speed
 * (timeMap), marker. Người dùng Import FCPXML vào Premiere.
 */

export interface FcpMarker {
  /** vị trí (giây) tính từ đầu clip. */
  startSec: number;
  name: string;
}

export interface FcpClip {
  /** đường dẫn file gốc (sẽ thành src="file://..."). */
  assetPath: string;
  /** tên hiển thị. */
  name: string;
  /** vị trí bắt đầu trên timeline (giây). */
  timelineStartSec: number;
  /** in-point trong nguồn (giây). */
  sourceInSec: number;
  /** thời lượng on-timeline (giây). */
  durationSec: number;
  /** tốc độ (1 = bình thường, 0.5 = slow-mo, 2 = nhanh). */
  speed?: number;
  /** thời lượng tổng của asset nguồn (giây) — cho metadata. */
  assetDurationSec?: number;
  hasAudio?: boolean;
  markers?: FcpMarker[];
}

export interface FcpTimeline {
  name: string;
  fps: number;
  width: number;
  height: number;
  /** clip theo thứ tự trên spine. */
  clips: FcpClip[];
}

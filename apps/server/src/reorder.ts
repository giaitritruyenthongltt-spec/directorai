/**
 * C1 — Sắp lại clip an toàn (ripple-aware, không chồng lấn).
 *
 * Vấn đề cũ (audit): move đặt clip theo vị trí TUYỆT ĐỐI của index → đè lên
 * clip khác; lại trộn track video+audio vào 1 index.
 *
 * Cách an toàn: chỉ re-pack clip VIDEO trên CÙNG 1 track theo thứ tự đích,
 * dán liền nhau (contiguous), bằng chiến lược PARK-THEN-PLACE:
 *  1. "Đỗ" mọi clip ra vùng xa (sau toàn bộ vùng đang dùng) — các ô rời nhau.
 *  2. "Đặt" lại theo thứ tự đích, dán liền từ điểm đầu khối.
 * Vì vùng đỗ tách rời hoàn toàn vùng đặt, không bao giờ chồng lấn giữa chừng.
 *
 * Hàm thuần (không adapter) để dễ test no-overlap trên mock.
 */

import type { Clip } from '@directorai/core';

export interface MoveIntent {
  clipId: string;
  toIndex: number;
}

export interface MoveOp {
  clipId: string;
  newStart: number;
}

/** Áp lần lượt các "đưa clip tới index N" thành thứ tự cuối (array-move). */
export function applyMovesToOrder(
  currentOrder: string[],
  intents: readonly MoveIntent[]
): string[] {
  const order = [...currentOrder];
  for (const it of intents) {
    const from = order.indexOf(it.clipId);
    if (from < 0) continue;
    order.splice(from, 1);
    const to = Math.max(0, Math.min(order.length, Math.round(it.toIndex)));
    order.splice(to, 0, it.clipId);
  }
  return order;
}

/**
 * Tính chuỗi moveClip an toàn để re-pack `videoClips` (CÙNG 1 track) theo
 * thứ tự đích từ `intents`. Trả [] nếu thứ tự không đổi.
 */
export function computeReorderOps(
  videoClips: readonly Clip[],
  intents: readonly MoveIntent[]
): MoveOp[] {
  const sorted = [...videoClips].sort((a, b) => a.timelineRange.start - b.timelineRange.start);
  if (sorted.length === 0) return [];
  const dur = new Map(sorted.map((c) => [c.id, c.timelineRange.end - c.timelineRange.start]));
  const origOrder = sorted.map((c) => c.id);
  const finalOrder = applyMovesToOrder(origOrder, intents);

  // Không đổi thứ tự → khỏi làm gì.
  if (finalOrder.length === origOrder.length && finalOrder.every((id, i) => id === origOrder[i])) {
    return [];
  }

  const blockStart = sorted[0]!.timelineRange.start as number;
  const lastEnd = sorted[sorted.length - 1]!.timelineRange.end as number;
  const totalDur = sorted.reduce((s, c) => s + (dur.get(c.id) ?? 0), 0);
  const maxDur = Math.max(1, ...sorted.map((c) => dur.get(c.id) ?? 0));
  // Vùng đỗ: sau toàn bộ vùng đang dùng + tổng thời lượng (đủ rộng), các ô
  // cách nhau maxDur+1 nên không đè nhau.
  const parkBase = lastEnd + totalDur + maxDur + 10;

  const ops: MoveOp[] = [];
  sorted.forEach((c, i) => ops.push({ clipId: c.id, newStart: parkBase + i * (maxDur + 1) }));
  let cursor = blockStart;
  for (const id of finalOrder) {
    ops.push({ clipId: id, newStart: cursor });
    cursor += dur.get(id) ?? 0;
  }
  return ops;
}

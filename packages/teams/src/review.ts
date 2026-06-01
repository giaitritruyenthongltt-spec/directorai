/**
 * P5.07a–c — Review/approve workflow.
 *
 * A Review wraps a proposed plan (style apply) with reviewers,
 * inline comments at timecodes, and a final decision. The producer
 * sees side-by-side: current sequence snapshot vs proposed plan
 * result.
 *
 * Notifications (P5.07c) are out-of-band — the review router calls
 * a Notifier on state changes (email + Slack); we provide the
 * interface + a NoopNotifier here. Production wires Postmark + a
 * Slack webhook (owner-completed).
 */
import { z } from 'zod';

export const ReviewStatusSchema = z.enum(['open', 'approved', 'changes-requested', 'cancelled']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReviewCommentSchema = z.object({
  id: z.string().uuid(),
  reviewId: z.string().uuid(),
  authorEmail: z.string().email(),
  /** Timecode in seconds where the comment is pinned. */
  atSec: z.number().nonnegative(),
  body: z.string().min(1).max(2000),
  createdAt: z.string().datetime(),
});
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sequenceId: z.string(),
  /** Style applied to create the proposed plan. */
  styleName: z.string(),
  proposerEmail: z.string().email(),
  reviewerEmails: z.array(z.string().email()).min(1),
  status: ReviewStatusSchema,
  /** Path / reference to the "before" snapshot (P4.06 CheckpointStore). */
  beforeCheckpointId: z.string(),
  /** Path / reference to the "after" snapshot (post-apply). */
  afterCheckpointId: z.string(),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().optional(),
  decidedBy: z.string().email().optional(),
});
export type Review = z.infer<typeof ReviewSchema>;

export interface Notifier {
  notify(event: {
    kind: 'requested' | 'commented' | 'approved' | 'changes-requested' | 'cancelled';
    review: Review;
    actorEmail: string;
    note?: string;
  }): Promise<void>;
}

export class NoopNotifier implements Notifier {
  async notify(): Promise<void> {
    // intentionally empty — production swaps in Postmark/Slack
    return undefined;
  }
}

export interface IReviewStore {
  saveReview(r: Review): Promise<void>;
  getReview(id: string): Promise<Review | null>;
  listReviews(workspaceId: string, status?: ReviewStatus): Promise<readonly Review[]>;
  addComment(c: ReviewComment): Promise<void>;
  listComments(reviewId: string): Promise<readonly ReviewComment[]>;
}

export class InMemoryReviewStore implements IReviewStore {
  private reviews = new Map<string, Review>();
  private comments = new Map<string, ReviewComment[]>();

  async saveReview(r: Review): Promise<void> {
    this.reviews.set(r.id, r);
  }
  async getReview(id: string): Promise<Review | null> {
    return this.reviews.get(id) ?? null;
  }
  async listReviews(workspaceId: string, status?: ReviewStatus): Promise<readonly Review[]> {
    let out = [...this.reviews.values()].filter((r) => r.workspaceId === workspaceId);
    if (status) out = out.filter((r) => r.status === status);
    return out;
  }
  async addComment(c: ReviewComment): Promise<void> {
    const list = this.comments.get(c.reviewId) ?? [];
    this.comments.set(c.reviewId, [...list, c]);
  }
  async listComments(reviewId: string): Promise<readonly ReviewComment[]> {
    return this.comments.get(reviewId) ?? [];
  }
}

/**
 * P5.07a — side-by-side diff between two checkpoint snapshots.
 *
 * Today we compute a flat diff (added/removed clips by id, marker
 * count delta). Visual thumbnails are owner-completed (UXP-side
 * render in the panel). The data model is the value here — the
 * panel knows how to render once it has the diff.
 */
export interface CheckpointLike {
  activeSequence: {
    tracks: readonly { kind: string; clips: readonly { id: string }[] }[];
    markers?: readonly unknown[];
  } | null;
}

export interface SnapshotDiff {
  addedClipIds: readonly string[];
  removedClipIds: readonly string[];
  markersDelta: number;
}

export function diffSnapshots(before: CheckpointLike, after: CheckpointLike): SnapshotDiff {
  const idsOf = (cp: CheckpointLike): Set<string> => {
    const out = new Set<string>();
    if (!cp.activeSequence) return out;
    for (const t of cp.activeSequence.tracks) for (const c of t.clips) out.add(c.id);
    return out;
  };
  const a = idsOf(before);
  const b = idsOf(after);
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of b) if (!a.has(id)) added.push(id);
  for (const id of a) if (!b.has(id)) removed.push(id);
  const beforeMarkers = before.activeSequence?.markers?.length ?? 0;
  const afterMarkers = after.activeSequence?.markers?.length ?? 0;
  return {
    addedClipIds: added,
    removedClipIds: removed,
    markersDelta: afterMarkers - beforeMarkers,
  };
}

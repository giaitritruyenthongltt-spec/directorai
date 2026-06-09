import { describe, it, expect } from 'vitest';
import {
  diffSnapshots,
  InMemoryReviewStore,
  NoopNotifier,
  type Review,
  type ReviewComment,
} from '../index.js';

const ws = '00000000-0000-4000-8000-000000000001';

const mkReview = (over: Partial<Review> = {}): Review => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: ws,
  sequenceId: 'seq-1',
  styleName: 'vlog',
  proposerEmail: 'p@x.com',
  reviewerEmails: ['r@x.com'],
  status: 'open',
  beforeCheckpointId: 'cp-before',
  afterCheckpointId: 'cp-after',
  createdAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

describe('Review store (P5.07a/b)', () => {
  it('save + list filters by workspace and status', async () => {
    const s = new InMemoryReviewStore();
    await s.saveReview(mkReview({ id: '11111111-1111-4111-8111-aaaaaaaaaaaa' }));
    await s.saveReview(
      mkReview({ id: '11111111-1111-4111-8111-bbbbbbbbbbbb', status: 'approved' })
    );
    await s.saveReview(
      mkReview({ id: '11111111-1111-4111-8111-cccccccccccc', workspaceId: 'other-ws' })
    );
    expect((await s.listReviews(ws)).length).toBe(2);
    expect((await s.listReviews(ws, 'open')).length).toBe(1);
    expect((await s.listReviews('other-ws')).length).toBe(1);
  });

  it('comments append + list in order', async () => {
    const s = new InMemoryReviewStore();
    const review = mkReview();
    await s.saveReview(review);
    const c1: ReviewComment = {
      id: '22222222-2222-4222-8222-aaaaaaaaaaaa',
      reviewId: review.id,
      authorEmail: 'r@x.com',
      atSec: 5,
      body: 'cut a bit early',
      createdAt: '2026-06-01T00:01:00.000Z',
    };
    const c2: ReviewComment = { ...c1, id: '22222222-2222-4222-8222-bbbbbbbbbbbb', atSec: 12 };
    await s.addComment(c1);
    await s.addComment(c2);
    const list = await s.listComments(review.id);
    expect(list).toHaveLength(2);
    expect(list[0]!.atSec).toBe(5);
    expect(list[1]!.atSec).toBe(12);
  });
});

describe('NoopNotifier (P5.07c)', () => {
  it('does nothing without throwing', async () => {
    const n = new NoopNotifier();
    await expect(
      n.notify({ kind: 'requested', review: mkReview(), actorEmail: 'p@x.com' })
    ).resolves.toBeUndefined();
  });
});

describe('diffSnapshots (P5.07a)', () => {
  const before = {
    activeSequence: {
      tracks: [{ kind: 'video', clips: [{ id: 'c1' }, { id: 'c2' }] }],
      markers: [{}, {}],
    },
  };
  const after = {
    activeSequence: {
      tracks: [{ kind: 'video', clips: [{ id: 'c2' }, { id: 'c3' }] }],
      markers: [{}, {}, {}, {}],
    },
  };
  it('catches added + removed clip ids', () => {
    const d = diffSnapshots(before, after);
    expect(d.addedClipIds).toEqual(['c3']);
    expect(d.removedClipIds).toEqual(['c1']);
    expect(d.markersDelta).toBe(2);
  });
  it('handles null after as full removal', () => {
    const d = diffSnapshots(before, { activeSequence: null });
    expect(d.removedClipIds).toEqual(['c1', 'c2']);
    expect(d.addedClipIds).toEqual([]);
  });
});

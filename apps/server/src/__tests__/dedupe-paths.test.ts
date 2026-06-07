/** FB2 — dedupePaths: khử trùng đường dẫn clip (giữ thứ tự xuất hiện đầu). */
import { describe, it, expect } from 'vitest';
import { dedupePaths } from '../director-tools.js';

describe('dedupePaths', () => {
  it('removes duplicates, keeps first-seen order', () => {
    expect(dedupePaths(['a.mp4', 'b.mp4', 'a.mp4', 'c.mp4', 'b.mp4'])).toEqual([
      'a.mp4',
      'b.mp4',
      'c.mp4',
    ]);
  });

  it('trims and drops blank entries', () => {
    expect(dedupePaths([' a.mp4 ', '', '   ', 'a.mp4'])).toEqual(['a.mp4']);
  });

  it('returns empty for empty input', () => {
    expect(dedupePaths([])).toEqual([]);
  });

  it('preserves non-duplicate list unchanged', () => {
    expect(dedupePaths(['x', 'y', 'z'])).toEqual(['x', 'y', 'z']);
  });
});

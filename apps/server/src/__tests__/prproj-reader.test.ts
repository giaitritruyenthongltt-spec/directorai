import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { extractMediaPaths, decodeXmlEntities, readPrprojMedia } from '../prproj-reader.js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" ?>
<PremiereData Version="3">
  <Media ObjectUID="a">
    <RelativePath>../clips/0530.mp4</RelativePath>
    <FilePath>E:\\T11\\Copied\\0530.mp4</FilePath>
    <ActualMediaFilePath>E:\\T11\\Copied\\0530.mp4</ActualMediaFilePath>
  </Media>
  <Media ObjectUID="b">
    <ActualMediaFilePath>/Users/me/Downloads/1. TEASER &amp; END.mp4</ActualMediaFilePath>
  </Media>
  <Media ObjectUID="synthetic">
    <FilePath>1112293707</FilePath>
    <ActualMediaFilePath>1112293707</ActualMediaFilePath>
  </Media>
</PremiereData>`;

describe('prproj-reader', () => {
  it('decodes basic XML entities', () => {
    expect(decodeXmlEntities('a &amp; b')).toBe('a & b');
    expect(decodeXmlEntities('x&#10;y')).toBe('x\ny');
  });

  it('extracts absolute media paths, skips synthetic numeric values', () => {
    const media = extractMediaPaths(SAMPLE);
    const paths = media.map((m) => m.fullPath);
    expect(paths).toContain('E:\\T11\\Copied\\0530.mp4');
    expect(paths).toContain('/Users/me/Downloads/1. TEASER & END.mp4');
    // synthetic "1112293707" (không có separator) bị loại
    expect(paths.some((p) => p === '1112293707')).toBe(false);
  });

  it('dedupes by full path + derives basename', () => {
    const media = extractMediaPaths(SAMPLE);
    // 0530.mp4 xuất hiện 2 lần (FilePath + ActualMediaFilePath) → 1 entry
    const fives = media.filter((m) => m.name === '0530.mp4');
    expect(fives.length).toBe(1);
    expect(fives[0]!.fullPath).toBe('E:\\T11\\Copied\\0530.mp4');
  });

  it('reads + gunzips a .prproj file from disk', async () => {
    const tmp = path.join(os.tmpdir(), `directorai-test-${process.pid}.prproj`);
    await fs.writeFile(tmp, gzipSync(Buffer.from(SAMPLE, 'utf8')));
    try {
      const media = await readPrprojMedia(tmp);
      expect(media.map((m) => m.name)).toContain('0530.mp4');
    } finally {
      await fs.rm(tmp, { force: true });
    }
  });
});

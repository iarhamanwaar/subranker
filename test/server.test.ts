import { describe, expect, it } from 'vitest';
import { parseExtras, parseSubtitlePath } from '../src/server.js';

describe('parseExtras', () => {
  it('parses the full extras segment Stremio can send', () => {
    const e = parseExtras(
      'videoHash=9d8c1e6c3d434f50&videoSize=1632335363&filename=John.Wick.Chapter.4.mp4',
    );
    expect(e.videoHash).toBe('9d8c1e6c3d434f50');
    expect(e.videoSize).toBe(1632335363);
    expect(e.filename).toBe('John.Wick.Chapter.4.mp4');
  });

  it('url-decodes a filename with spaces', () => {
    const e = parseExtras('filename=Demon%20Slayer%20-%20S01E01%20Bluray-1080p.mkv');
    expect(e.filename).toBe('Demon Slayer - S01E01 Bluray-1080p.mkv');
  });

  it('returns empty extras when the client omits the segment', () => {
    expect(parseExtras(undefined)).toEqual({});
  });
});

describe('parseSubtitlePath', () => {
  it('parses a bare request with no extras', () => {
    const p = parseSubtitlePath('/subtitles/series/tt9335498:1:1.json');
    expect(p).toEqual({ type: 'series', id: 'tt9335498:1:1', extras: {} });
  });

  it('parses a request carrying extras', () => {
    const p = parseSubtitlePath(
      '/subtitles/series/tt9335498:1:1/videoSize=1144288919&filename=a.mkv.json',
    );
    expect(p?.id).toBe('tt9335498:1:1');
    expect(p?.extras.filename).toBe('a.mkv');
    expect(p?.extras.videoSize).toBe(1144288919);
  });

  it('ignores non-subtitle paths', () => {
    expect(parseSubtitlePath('/stream/movie/tt0111161.json')).toBeNull();
    expect(parseSubtitlePath('/manifest.json')).toBeNull();
  });
});

describe('manifest version', () => {
  it('matches package.json, so a release cannot ship a stale number', async () => {
    const { buildManifest } = await import('../src/manifest.js');
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(buildManifest({ name: 'SubRanker' }).version).toBe(pkg.version);
    expect(buildManifest({ name: 'SubRanker' }).version).not.toBe('0.0.0');
  });
});

import { describe, expect, it } from 'vitest';
import { buildShiftPath, isFetchableUrl, parseShiftPath } from '../src/shift/route.js';

describe('shift path round-trip', () => {
  it('survives a round trip with a negative offset', () => {
    const req = { offset: -2.5, rate: 1, url: 'https://example.com/a.srt?x=1&y=2' };
    const parsed = parseShiftPath(buildShiftPath(req));
    expect(parsed).toEqual(req);
  });

  it('preserves a framerate ratio to three decimals', () => {
    const rate = 25 / 23.976;
    const parsed = parseShiftPath(buildShiftPath({ offset: 0, rate, url: 'https://e.com/a.srt' }));
    expect(parsed!.rate).toBeCloseTo(rate, 3);
  });

  it('rejects a malformed path', () => {
    expect(parseShiftPath('/shift/abc/def/xyz.srt')).toBeNull();
    expect(parseShiftPath('/subtitles/movie/tt1.json')).toBeNull();
  });

  it('rejects a non-positive rate', () => {
    expect(parseShiftPath('/shift/p0_000/p0_000/aHR0cHM6Ly9lLmNvbQ.srt')).toBeNull();
  });
});

describe('isFetchableUrl', () => {
  it('allows ordinary public URLs', () => {
    expect(isFetchableUrl('https://dl.opensubtitles.org/x.srt')).toBe(true);
    expect(isFetchableUrl('http://sub.wyzie.io/a')).toBe(true);
  });

  // This route takes a URL from the caller, so without these checks it would be
  // an open proxy into the host's own network.
  it('blocks loopback and private ranges', () => {
    for (const u of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://10.0.0.5/x',
      'http://192.168.18.202/x',
      'http://172.16.4.4/x',
      'http://0.0.0.0/x',
    ]) {
      expect(isFetchableUrl(u), u).toBe(false);
    }
  });

  it('blocks cloud instance metadata', () => {
    expect(isFetchableUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('blocks non-http schemes', () => {
    expect(isFetchableUrl('file:///etc/passwd')).toBe(false);
    expect(isFetchableUrl('gopher://x/1')).toBe(false);
    expect(isFetchableUrl('not a url')).toBe(false);
  });
});

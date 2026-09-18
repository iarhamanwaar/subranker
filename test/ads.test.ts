import { describe, expect, it } from 'vitest';
import { looksLikeAd, stripAds } from '../src/shift/ads.js';

/** Both banners below were observed in files served to this addon. */
const WITH_ADS = `1
00:00:00,000 --> 00:00:05,074
Watch Online Movies and Series for FREE
www.osdb.link/lm

2
00:00:25,370 --> 00:00:26,460
How?

3
00:00:29,920 --> 00:00:32,210
How did this happen?

4
00:23:30,000 --> 00:23:35,000
Subtitles by OpenSubtitles
`;

describe('looksLikeAd', () => {
  it('spots provider banners', () => {
    expect(looksLikeAd('Watch Online Movies and Series for FREE www.osdb.link/lm')).toBe(true);
    expect(looksLikeAd('>>OpenSubtitles v3+ v0.0.4<<')).toBe(true);
    expect(looksLikeAd('Synchronized and corrected by someone')).toBe(true);
  });

  it('leaves ordinary dialogue alone', () => {
    expect(looksLikeAd('How did this happen?')).toBe(false);
    expect(looksLikeAd("Nezuko, don't die on me.")).toBe(false);
  });
});

describe('stripAds', () => {
  it('removes banners at both ends and keeps the dialogue', () => {
    const { content, removed } = stripAds(WITH_ADS);
    expect(removed).toBe(2);
    expect(content).toContain('How?');
    expect(content).toContain('How did this happen?');
    expect(content).not.toContain('osdb.link');
    expect(content).not.toContain('Subtitles by OpenSubtitles');
  });

  it('renumbers the remaining cues contiguously', () => {
    const { content } = stripAds(WITH_ADS);
    const numbers = content.split('\n').filter((l) => /^\d+$/.test(l.trim()));
    expect(numbers).toEqual(['1', '2']);
  });

  it('does not touch a file with no ads', () => {
    const clean = '1\n00:00:25,370 --> 00:00:26,460\nHow?\n';
    expect(stripAds(clean)).toEqual({ content: clean, removed: 0 });
  });

  it('keeps a mid-film line that merely mentions a website', () => {
    // Far from either edge, so it is dialogue rather than a banner.
    const mid = '1\n00:00:10,000 --> 00:00:12,000\nstart\n\n' +
      '2\n00:10:00,000 --> 00:10:02,000\nGo to www.example.com for details\n\n' +
      '3\n00:20:00,000 --> 00:20:02,000\nend\n';
    const { removed, content } = stripAds(mid);
    expect(removed).toBe(0);
    expect(content).toContain('www.example.com');
  });

  it('leaves ASS files untouched', () => {
    const ass = 'Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,OpenSubtitles\n';
    expect(stripAds(ass).removed).toBe(0);
  });
});

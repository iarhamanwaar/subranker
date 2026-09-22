import { describe, expect, it } from 'vitest';
import { align, isTrustworthy, parseTimeline, distinctOnsets } from '../src/verify/cues.js';

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:06.000
>>OpenSubtitles v3+ v0.0.4<<

2
00:00:25.370 --> 00:00:26.460
How?

3
00:00:29.920 --> 00:00:32.210
How did this happen?

4
00:00:34.630 --> 00:00:37.140
Nezuko, don't die! Don't die on me!
`;

describe('parseTimeline', () => {
  it('parses VTT cue starts and strips the injected advertising cue', () => {
    const t = parseTimeline(VTT);
    // The 00:00:01 banner is dropped; real dialogue starts at 25.37.
    expect(t[0]).toBeCloseTo(25.37, 2);
    expect(t).toHaveLength(3);
  });

  it('parses SRT comma-separated milliseconds', () => {
    const t = parseTimeline('1\n00:00:10,500 --> 00:00:12,000\nHello\n');
    expect(t[0]).toBeCloseTo(10.5, 2);
  });

  it('parses ASS dialogue lines', () => {
    const ass = 'Dialogue: 0,0:00:25.37,0:00:26.46,Default,,0,0,0,,How?\n' +
      'Dialogue: 0,0:00:29.92,0:00:32.21,Default,,0,0,0,,How did this happen?\n';
    const t = parseTimeline(ass);
    expect(t).toHaveLength(2);
    expect(t[0]).toBeCloseTo(25.37, 2);
  });

  it('returns an empty timeline for content with no cues', () => {
    expect(parseTimeline('<html>404 Not Found</html>')).toHaveLength(0);
  });
});

describe('align', () => {
  const reference = Array.from({ length: 200 }, (_, i) => 25 + i * 7.3);

  it('detects a constant offset', () => {
    // The measured real-world case: two legitimate subtitles 262ms apart.
    const candidate = reference.map((t) => t - 0.262);
    const a = align(candidate, reference);
    expect(a.rate).toBe(1);
    expect(a.offset).toBeGreaterThan(0);
    expect(a.agreement).toBeGreaterThan(0.8);
  });

  it('detects a 23.976-to-25 framerate drift', () => {
    const ratio = 25 / 23.976;
    const candidate = reference.map((t) => t / ratio);
    const a = align(candidate, reference);
    expect(a.rate).toBeCloseTo(ratio, 2);
    expect(a.agreement).toBeGreaterThan(0.8);
  });

  it('reports low agreement for unrelated content', () => {
    const candidate = Array.from({ length: 200 }, (_, i) => 3 + i * 11.7);
    const a = align(candidate, reference);
    expect(isTrustworthy(a)).toBe(false);
  });

  it('returns a neutral alignment when a timeline is too short to judge', () => {
    const a = align([1, 2], reference);
    expect(a.agreement).toBe(0);
    expect(a.rate).toBe(1);
  });
});

describe('align with layered typesetting', () => {
  it('does not let stacked identical onsets saturate agreement at a false offset', () => {
    // Irregular gaps, as in real dialogue; a periodic grid would make a shift
    // of one gap look as good as the truth.
    let t = 10;
    const reference = Array.from({ length: 200 }, (_, i) => (t += 2 + ((i * 37) % 11) * 0.9));
    // 85% of the dialogue in sync (real files differ a little), plus 20 signs
    // that happen to sit 150s after a line, each stacked 12 layers deep. The
    // stack alone used to outvote the whole in-sync dialogue track.
    const layered = [
      ...reference.filter((_, i) => i % 7 !== 0),
      ...reference.slice(0, 20).flatMap((t) => Array.from({ length: 12 }, () => t + 150)),
    ].sort((a, b) => a - b);
    const a = align(layered, reference);
    expect(a.offset).toBe(0);
    expect(a.agreement).toBeGreaterThan(0.8);
  });

  it('collapses onsets closer than the gap', () => {
    expect(distinctOnsets([1, 1, 1.1, 1.5, 3])).toEqual([1, 1.5, 3]);
  });
});

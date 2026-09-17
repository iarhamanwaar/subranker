import { describe, expect, it } from 'vitest';
import { align, isTrustworthy, parseTimeline } from '../src/verify/cues.js';

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

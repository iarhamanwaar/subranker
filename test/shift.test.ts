import { describe, expect, it } from 'vitest';
import { applyShift, isShiftWorthApplying } from '../src/shift/rewrite.js';
import { align, parseTimeline } from '../src/verify/cues.js';

const SRT = `1
00:00:25,370 --> 00:00:26,460
How?

2
00:00:29,920 --> 00:00:32,210
How did this happen?
`;

describe('applyShift', () => {
  it('applies a constant offset to SRT timestamps', () => {
    const out = applyShift(SRT, { offset: 2.5, rate: 1 });
    expect(out).toContain('00:00:27,870 --> 00:00:28,960');
    expect(out).toContain('How did this happen?'); // text untouched
  });

  it('clamps to zero instead of emitting a negative timestamp', () => {
    const out = applyShift(SRT, { offset: -60, rate: 1 });
    expect(out).toContain('00:00:00,000');
    // A negative time would render as "-00:00:34,630"; the arrow's dashes are fine.
    expect(out).not.toMatch(/-\d{2}:\d{2}:\d{2}/);
  });

  it('keeps VTT dot separators', () => {
    const out = applyShift('00:00:10.000 --> 00:00:12.000\nHi\n', { offset: 1, rate: 1 });
    expect(out).toContain('00:00:11.000 --> 00:00:13.000');
  });

  it('rewrites ASS dialogue lines and leaves styling alone', () => {
    const ass = 'Dialogue: 0,0:00:25.37,0:00:26.46,Default,,0,0,0,,{\\pos(100,200)}How?\n';
    const out = applyShift(ass, { offset: 1, rate: 1 });
    expect(out).toContain('0:00:26.37');
    expect(out).toContain('{\\pos(100,200)}How?');
  });

  it('corrects a framerate drift so the result aligns with the reference', () => {
    const ratio = 25 / 23.976;
    // Build a file whose timeline runs slow by the 23.976/25 ratio.
    const reference = Array.from({ length: 120 }, (_, i) => 25 + i * 7.3);
    const skewed = reference
      .map((t) => {
        const v = t / ratio;
        const h = String(Math.floor(v / 3600)).padStart(2, '0');
        const m = String(Math.floor((v % 3600) / 60)).padStart(2, '0');
        const s = String(Math.floor(v % 60)).padStart(2, '0');
        const ms = String(Math.round((v % 1) * 1000)).padStart(3, '0');
        return `${h}:${m}:${s},${ms} --> ${h}:${m}:${s},${ms}\ntext\n`;
      })
      .join('\n');

    const before = align(parseTimeline(skewed), reference);
    const fixed = applyShift(skewed, { offset: before.offset, rate: before.rate });
    const after = align(parseTimeline(fixed), reference);

    expect(after.rate).toBe(1);
    expect(Math.abs(after.offset)).toBeLessThan(0.3);
    expect(after.agreement).toBeGreaterThan(before.agreement - 0.05);
  });
});

describe('isShiftWorthApplying', () => {
  it('ignores negligible corrections', () => {
    expect(isShiftWorthApplying({ offset: 0.05, rate: 1 })).toBe(false);
  });

  it('applies a visible offset', () => {
    expect(isShiftWorthApplying({ offset: 1.2, rate: 1 })).toBe(true);
  });

  it('applies a framerate drift even with no offset', () => {
    expect(isShiftWorthApplying({ offset: 0, rate: 25 / 23.976 })).toBe(true);
  });
});

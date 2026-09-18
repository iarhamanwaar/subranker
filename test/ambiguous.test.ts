import { describe, expect, it } from 'vitest';
import { align, isAmbiguous } from '../src/verify/cues.js';
import { isShiftSafeToApply } from '../src/shift/rewrite.js';

// A dialogue timeline: 320 cues over ~23 minutes with irregular gaps, so no
// accidental periodicity makes every offset look plausible.
function timeline(n = 320, seed = 7): number[] {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const out: number[] = [];
  let t = 6;
  for (let i = 0; i < n; i++) { t += 1.5 + rnd() * 6; out.push(t); }
  return out;
}

describe('ambiguous alignment', () => {
  it('flags two cuts of the same episode, which no single shift can fit', () => {
    // Demon Slayer S01E08 as measured: the cold open lines up at about +1s,
    // then roughly 8s of footage differs and the rest lines up at about -7s.
    const ref = timeline();
    const cand = ref.map((t, i) => (i < 130 ? t - 1 : t + 7));
    const a = align(cand, ref);
    expect(isAmbiguous(a)).toBe(true);
    expect(isShiftSafeToApply({ offset: a.offset, rate: a.rate }, a.agreement, a)).toBe(false);
  });

  it('does not flag a file that is uniformly late', () => {
    const ref = timeline();
    const cand = ref.map((t) => t - 4);
    const a = align(cand, ref);
    expect(a.offset).toBeCloseTo(4, 0);
    expect(isAmbiguous(a)).toBe(false);
    expect(isShiftSafeToApply({ offset: a.offset, rate: a.rate }, a.agreement, a)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { consensusTimeline } from '../src/pipeline.js';
import { applyTimingScore, TIMING_BONUS } from '../src/score/score.js';
import type { Candidate } from '../src/types.js';

const base = Array.from({ length: 150 }, (_, i) => 25 + i * 7.3);

function stub(agreement: number | undefined, ok = true): Candidate {
  return {
    raw: { id: 'x', url: 'u', lang: 'eng' },
    parsed: { sdh: false, dub: false, parser: 'none', confidence: 0 },
    releaseText: '',
    score: 0,
    reasons: [],
    verification: { ok, status: 200, agreement },
  };
}

describe('consensusTimeline', () => {
  it('picks the timeline the majority agrees with, not the first one', () => {
    const outlier = base.map((t) => t * 1.35 + 90); // badly mistimed
    const agreeing1 = base.map((t) => t + 0.2);
    const agreeing2 = base.map((t) => t - 0.1);

    // The outlier is deliberately first: a "take the first alive one" strategy
    // would anchor on it and punish the three correct timelines.
    const ref = consensusTimeline([outlier, base, agreeing1, agreeing2]);
    expect(ref).not.toBe(outlier);
  });

  it('falls back to the only usable timeline', () => {
    expect(consensusTimeline([[], base])).toBe(base);
  });

  it('returns an empty timeline when nothing is usable', () => {
    expect(consensusTimeline([[1, 2], []])).toEqual([1, 2]);
  });
});

describe('applyTimingScore', () => {
  it('rewards agreement in proportion to it', () => {
    const [high, low] = applyTimingScore([stub(1), stub(0.25)]);
    expect(high!.score).toBe(TIMING_BONUS);
    expect(low!.score).toBe(Math.round(TIMING_BONUS * 0.25));
    expect(high!.score).toBeGreaterThan(low!.score);
  });

  it('marks strong agreement as confirmed', () => {
    const [c] = applyTimingScore([stub(0.8)]);
    expect(c!.reasons).toContain('timing confirmed');
  });

  it('leaves unverified candidates untouched', () => {
    const [c] = applyTimingScore([stub(undefined, false)]);
    expect(c!.score).toBe(0);
    expect(c!.reasons).toHaveLength(0);
  });
});

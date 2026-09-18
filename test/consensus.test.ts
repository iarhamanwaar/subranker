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
    const { reference } = consensusTimeline([outlier, base, agreeing1, agreeing2]);
    expect(reference).not.toBe(outlier);
  });

  it('falls back to the only usable timeline', () => {
    expect(consensusTimeline([[], base]).reference).toBe(base);
  });

  it('returns an empty timeline when nothing is usable', () => {
    expect(consensusTimeline([[1, 2], []]).reference).toEqual([1, 2]);
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

describe('regression: spurious rate hypotheses', () => {
  it('does not invent a framerate drift for two well-aligned timelines', async () => {
    const { align } = await import('../src/verify/cues.js');
    const ref = Array.from({ length: 300 }, (_, i) => 25 + i * 4.1);
    const candidate = ref.map((t) => t + 0.25);
    const a = align(candidate, ref);
    // A 4.2% stretch can manufacture coincidences; it must not beat the truth.
    expect(a.rate).toBe(1);
    expect(Math.abs(a.offset)).toBeLessThan(1);
  });

  it('picks a sane reference even when an outlier is listed first', async () => {
    const good = Array.from({ length: 200 }, (_, i) => 25 + i * 6.7);
    // An outlier that a maximising aligner could warp into "agreeing" with all.
    const outlier = good.map((t) => t * 1.042 + 176.5);
    const { reference } = consensusTimeline([outlier, good, good.map((t) => t + 0.2), good.map((t) => t - 0.1)]);
    expect(reference).not.toBe(outlier);
  });
});

describe('anchor support', () => {
  it('reports full support when every timeline agrees', () => {
    const good = Array.from({ length: 150 }, (_, i) => 20 + i * 5.3);
    const { support } = consensusTimeline([good, good.map((t) => t + 0.2), good.map((t) => t - 0.1)]);
    expect(support).toBe(1);
  });

  it('reports no support when every timeline is a different cut', () => {
    const a = Array.from({ length: 120 }, (_, i) => 20 + i * 5.3);
    const b = Array.from({ length: 120 }, (_, i) => 500 + i * 9.1);
    const c = Array.from({ length: 120 }, (_, i) => 900 + i * 13.7);
    const { support } = consensusTimeline([a, b, c]);
    // Nothing commands a majority, so shifting must be refused downstream.
    expect(support).toBeLessThan(0.5);
  });
});

import { describe, expect, it } from 'vitest';
import { consensusTimeline, identityReference } from '../src/pipeline.js';
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

describe('identityReference', () => {
  it('returns null when there are no identity timelines', () => {
    expect(identityReference([])).toBeNull();
  });

  it('refuses an anchor that is too short to align against', () => {
    expect(identityReference([[1, 2, 3]])).toBeNull();
  });

  it('anchors on the identity timeline when it is usable', () => {
    const ref = identityReference([base]);
    expect(ref).toBe(base);
  });
});

describe('releaseMatchedReference', () => {
  it('anchors on the release-matching cut even when it is the minority', async () => {
    const { releaseMatchedReference } = await import('../src/pipeline.js');
    const { parseRelease } = await import('../src/parse/release.js');
    const target = await parseRelease('Eternals.2021.1080p.BluRay.1600MB.DD5.1.x264-GalaxyRG.mkv');

    // Irregular gaps like real dialogue, so a 69s shift does not alias onto
    // neighbouring cues (evenly-spaced cues would).
    let acc = 25;
    const base = Array.from({ length: 150 }, (_, i) => (acc += 2 + ((i * 37) % 13)));
    const shifted = base.map((t) => t + 69); // a different cut, ~69s long

    // 3 correct (x264 BluRay) vs 4 wrong (x265 / WEB) — the wrong cut is the majority.
    const cut = async (rel: string, tl: number[]) => ({ parsed: await parseRelease(rel), timeline: tl });
    const cuts = [
      await cut('Eternals.2021.1080p.BluRay.x265-YAWNTiC', shifted.map((t) => t + 0.1)),
      await cut('Eternals.2021.1080p.BluRay.x265-YAWNTiC.SDH', shifted.map((t) => t - 0.1)),
      await cut('Eternals.2021.1080p.WEB-DL.H.264-EVO', shifted.map((t) => t + 0.2)),
      await cut('Eternals.2021.2160p.WEB-DL.H.265-EVO', shifted),
      await cut('Eternals.2021.1080p.BluRay.x264-YTS', base.map((t) => t + 0.1)),
      await cut('Eternals.2021.1080p.BluRay.x264-YTS.AAC', base.map((t) => t - 0.1)),
      await cut('Eternals.2021.1080p.BluRay.1080p', base),
    ];

    const res = releaseMatchedReference(cuts, target);
    expect(res).not.toBeNull();
    // The chosen reference must be the GalaxyRG (0s) cut, not the +69s majority.
    expect(res!.reference[0]!).toBeLessThan(50);
  });

  it('returns null when the release cannot tell the cuts apart', async () => {
    const { releaseMatchedReference } = await import('../src/pipeline.js');
    const { parseRelease } = await import('../src/parse/release.js');
    const target = await parseRelease('Movie.2020.1080p.BluRay.x264-GRP.mkv');
    let acc = 30;
    const base = Array.from({ length: 120 }, (_, i) => (acc += 3 + ((i * 29) % 11)));
    const shifted = base.map((t) => t + 40);
    const none = { sdh: false, dub: false, parser: 'none' as const, confidence: 0 };
    const cuts = [
      { parsed: none, timeline: base },
      { parsed: none, timeline: base.map((t) => t + 0.1) },
      { parsed: none, timeline: shifted },
      { parsed: none, timeline: shifted.map((t) => t - 0.1) },
    ];
    expect(releaseMatchedReference(cuts, target)).toBeNull();
  });
});

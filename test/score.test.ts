import { describe, expect, it } from 'vitest';
import { parseRelease } from '../src/parse/release.js';
import { DEFAULT_SCORE_OPTIONS, HASH_WEIGHT, rank, scoreAll } from '../src/score/score.js';
import type { Candidate, RequestExtras } from '../src/types.js';

async function candidate(releaseText: string, extra: Record<string, unknown> = {}): Promise<Candidate> {
  return {
    raw: { id: releaseText, url: 'https://example.invalid/s.srt', lang: 'eng', ...extra },
    parsed: await parseRelease(releaseText),
    releaseText,
    score: 0,
    reasons: [],
  };
}

/** The stream actually being played in the measured session. */
const TARGET = 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv';

describe('scoreAll / rank', () => {
  it('drops the dub-timed track entirely', async () => {
    const target = await parseRelease(TARGET);
    const cands = [
      await candidate('[Erai-raws] Kimetsu no Yaiba-01-1080p'),
      await candidate('Demon Slayer - S01E01 - Cruelty [KaiDubs] [1080p]'),
    ];
    const ranked = rank(scoreAll(cands, target, {}));
    expect(ranked.map((c) => c.releaseText)).not.toContain(
      'Demon Slayer - S01E01 - Cruelty [KaiDubs] [1080p]',
    );
  });

  it('ranks an exact-group match above a generic one', async () => {
    const target = await parseRelease('[Erai-raws] Kimetsu no Yaiba-01-1080p.mkv');
    const cands = [
      await candidate('Demon.Slayer.S01E01.WEBRip.Netflix'),
      await candidate('[Erai-raws] Kimetsu no Yaiba-01-1080p'),
    ];
    const ranked = rank(scoreAll(cands, target, {}));
    expect(ranked[0]?.parsed.group).toBe('erai-raws');
  });

  it('puts a hash match first even when nothing else matches', async () => {
    const target = await parseRelease(TARGET);
    const extras: RequestExtras = { videoHash: 'ABC123' };
    const cands = [
      await candidate('Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p'),
      await candidate('Totally.Unrelated.Name', { moviehash: 'abc123' }),
    ];
    const ranked = rank(scoreAll(cands, target, extras));
    expect(ranked[0]?.releaseText).toBe('Totally.Unrelated.Name');
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(HASH_WEIGHT);
    expect(ranked[0]?.reasons).toContain('exact file match');
  });

  it('demotes SDH when a non-SDH alternative exists', async () => {
    const target = await parseRelease(TARGET);
    const cands = [
      await candidate('Demon Slayer - S01E01.[BD]English[CC]'),
      await candidate('Demon Slayer - S01E01 Bluray-1080p'),
    ];
    const ranked = rank(scoreAll(cands, target, {}));
    expect(ranked[0]?.parsed.sdh).toBe(false);
  });

  it('keeps SDH when it is the only option, rather than returning nothing', async () => {
    const target = await parseRelease(TARGET);
    const cands = [await candidate('Demon Slayer - S01E01.[BD]English[CC]')];
    const ranked = rank(scoreAll(cands, target, {}));
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.parsed.sdh).toBe(true);
  });

  it('drops a subtitle for the wrong episode', async () => {
    const target = await parseRelease(TARGET);
    const cands = [await candidate('Demon Slayer - S01E26 Bluray-1080p')];
    const ranked = rank(scoreAll(cands, target, {}));
    expect(ranked).toHaveLength(0);
  });

  it('ranks instead of dropping when dropMismatches is off', async () => {
    const target = await parseRelease(TARGET);
    const cands = [
      await candidate('Demon Slayer - S01E01 - Cruelty [KaiDubs] [1080p]'),
      await candidate('Demon Slayer - S01E01 Bluray-1080p'),
    ];
    const ranked = rank(
      scoreAll(cands, target, {}, { ...DEFAULT_SCORE_OPTIONS, dropMismatches: false }),
    );
    expect(ranked).toHaveLength(2);
    expect(ranked[1]?.parsed.dub).toBe(true);
  });
});

describe('mismatch penalties', () => {
  it('ranks a matching release above one that contradicts it', async () => {
    const target = await parseRelease('Demon Slayer - S01E01 - Cruelty Bluray-1080p.mkv');
    const cands = [
      await candidate('Demon Slayer S01E01 WEBRip 480p'),
      await candidate('[Erai-raws] Kimetsu no Yaiba-01-1080p BluRay'),
    ];
    const ranked = rank(scoreAll(cands, target, {}));
    expect(ranked[0]?.parsed.resolution).toBe('1080p');
  });

  it('does not penalise a subtitle that states nothing', async () => {
    const target = await parseRelease('Demon Slayer - S01E01 Bluray-1080p.mkv');
    const silent = await candidate('Demon Slayer - S01E01');
    const [scored] = scoreAll([silent], target, {});
    expect(scored!.score).toBeGreaterThanOrEqual(0);
  });
});

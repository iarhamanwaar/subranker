import { describe, expect, it } from 'vitest';
import { parseRelease } from '../src/parse/release.js';
import { DEFAULT_SCORE_OPTIONS, HASH_WEIGHT, hasTitleBearingSub, rank, scoreAll } from '../src/score/score.js';
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

describe('episode identity and season', () => {
  // The real failure: upstream files Swordsmith Village (Cinemeta S4) subtitles
  // under Entertainment District's id (tt9335498:3:1). The requested episode is
  // "Sound Hashira Tengen Uzui"; the correct sub names it, the wrong ones carry
  // a different season or arc. Ranking on the id alone cannot tell them apart.
  const EP_TITLE = 'Sound Hashira Tengen Uzui';
  const reqTarget = async () => ({ ...(await parseRelease('')), season: 3, episode: 1 });

  it('lifts the sub that names the requested episode above the mislabelled majority', async () => {
    const target = await reqTarget();
    const cands = [
      await candidate('Demon.Slayer.Kimetsu.no.Yaiba.S03E01.JAPANESE.720p.WEBRip'),
      await candidate('Demon Slayer - Kimetsu no Yaiba (2019) - S04E01 - Someones Dream'),
      await candidate('[Crunchyroll] Demon Slayer S03E01 Sound Hashira Tengen Uzui'),
    ];
    const ranked = rank(
      scoreAll(cands, target, {}, { ...DEFAULT_SCORE_OPTIONS, episodeTitle: EP_TITLE }),
    );
    expect(ranked[0]?.releaseText).toContain('Sound Hashira Tengen Uzui');
    expect(ranked[0]?.identity).toBe(true);
    expect(ranked[0]?.reasons).toContain('episode match');
  });

  it('does not penalise a release that states a different season', async () => {
    // Anime arcs are filed under conflicting season numbers, so the correct
    // sub routinely states a "wrong" season — it must not be demoted for it.
    const target = await reqTarget();
    const [scored] = scoreAll(
      [await candidate('Demon Slayer - S04E01 - Someones Dream Bluray-1080p')],
      target,
      {},
    );
    expect(scored!.dropped).toBeUndefined();
    expect(scored!.reasons).not.toContain('wrong season');
    expect(scored!.score).toBeGreaterThanOrEqual(0);
  });

  it('does not flag identity when no episode title is known', async () => {
    const target = await reqTarget();
    const [scored] = scoreAll(
      [await candidate('[Crunchyroll] Demon Slayer S03E01 Sound Hashira Tengen Uzui')],
      target,
      {},
    );
    expect(scored!.identity).toBeFalsy();
  });
});

describe('hasTitleBearingSub / subtitleNames', () => {
  const sub = (extra: Record<string, unknown>) => ({ id: 'x', url: 'u', lang: 'eng', ...extra });

  it('detects an episode title in any name field', () => {
    const subs = [
      sub({ fileName: '[Crunchyroll] Demon Slayer S03E01 Sound Hashira Tengen Uzui.srt' }),
      sub({ releaseName: 'generic' }),
    ];
    expect(hasTitleBearingSub(subs, 'Sound Hashira Tengen Uzui')).toBe(true);
  });

  it('is false when no sub carries the title', () => {
    const subs = [sub({ fileName: 'Demon.Slayer.S03E01.WEBRip.srt' })];
    expect(hasTitleBearingSub(subs, 'Sound Hashira Tengen Uzui')).toBe(false);
  });

  it('is false when the title is unknown', () => {
    expect(hasTitleBearingSub([sub({ fileName: 'anything' })], undefined)).toBe(false);
  });
});

describe('arc-aware filtering', () => {
  const SWORDSMITH = ['swordsmith village', 'katanakaji', 'sato hen'];
  const OTHER_ARCS = ['entertainment district', 'yuukaku', 'hashira geiko', 'mugen ressha'];
  const opts = { ...DEFAULT_SCORE_OPTIONS, arcKeywords: SWORDSMITH, foreignArcKeywords: OTHER_ARCS };

  it('drops a subtitle that names a different arc', async () => {
    const target = { ...(await parseRelease('')), season: 4, episode: 1 };
    const [scored] = scoreAll(
      [await candidate('[Erai-raws] Kimetsu no Yaiba - Hashira Geiko Hen - 01')],
      target, {}, opts,
    );
    expect(scored!.dropped).toBe('wrong arc');
  });

  it('anchors a subtitle that names the requested arc', async () => {
    const target = { ...(await parseRelease('')), season: 4, episode: 1 };
    const [scored] = scoreAll(
      [await candidate('[SubsPlease] Kimetsu no Yaiba - Katanakaji no Sato-hen - 01')],
      target, {}, opts,
    );
    expect(scored!.dropped).toBeUndefined();
    expect(scored!.identity).toBe(true);
    expect(scored!.reasons).toContain('arc match');
  });

  it('leaves a generic release for the timeline to place', async () => {
    const target = { ...(await parseRelease('')), season: 4, episode: 1 };
    const [scored] = scoreAll(
      [await candidate('Demon.Slayer.Kimetsu.no.Yaiba.S04E01.1080p.WEB-DL')],
      target, {}, opts,
    );
    expect(scored!.dropped).toBeUndefined();
    expect(scored!.identity).toBeFalsy();
  });

  it('keeps a release that names the requested arc even if it also mentions another', async () => {
    const target = { ...(await parseRelease('')), season: 4, episode: 1 };
    const [scored] = scoreAll(
      [await candidate('Katanakaji no Sato-hen 01 (recap of Yuukaku-hen)')],
      target, {}, opts,
    );
    expect(scored!.dropped).toBeUndefined();
  });
});

describe('language preference', () => {
  const TARGET = 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv';

  it('drops non-preferred languages by default (English-only list)', async () => {
    const target = await parseRelease(TARGET);
    const cands = [
      await candidate('[Erai-raws] Kimetsu no Yaiba-01-1080p', { lang: 'fre' }),
      await candidate('Demon.Slayer.S01E01.WEBRip', { lang: 'eng' }),
    ];
    const ranked = rank(scoreAll(cands, target, {}, { ...DEFAULT_SCORE_OPTIONS, langPref: ['en', 'eng'] }));
    expect(ranked.map((c) => c.raw.lang)).toEqual(['eng']);
  });

  it('floats English above a better-matched non-English when kept (demote mode)', async () => {
    const target = await parseRelease('[Erai-raws] Kimetsu no Yaiba-01-1080p.mkv');
    const cands = [
      await candidate('[Erai-raws] Kimetsu no Yaiba-01-1080p', { lang: 'fre' }),
      await candidate('Demon.Slayer.S01E01.WEBRip', { lang: 'eng' }),
    ];
    const ranked = rank(
      scoreAll(cands, target, {}, { ...DEFAULT_SCORE_OPTIONS, langPref: ['en', 'eng'], dropOtherLangs: false }),
    );
    expect(ranked[0]?.raw.lang).toBe('eng');
    expect(ranked.map((c) => c.raw.lang)).toContain('fre');
  });

  it('is a no-op when langPref is unset (back-compat)', async () => {
    const target = await parseRelease(TARGET);
    const cands = [await candidate('whatever', { lang: 'fre' })];
    const ranked = rank(scoreAll(cands, target, {}));
    expect(ranked).toHaveLength(1);
  });
});

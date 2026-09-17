import { describe, expect, it } from 'vitest';
import { parseRelease } from '../src/parse/release.js';

/**
 * Every fixture below is a real release name observed in a live subtitle
 * response for Demon Slayer S01E01 and The Shawshank Redemption.
 */
describe('parseRelease', () => {
  it('extracts the fansub group from a bracketed anime release', async () => {
    const r = await parseRelease('[Erai-raws] Kimetsu no Yaiba-01-1080p');
    expect(r.group).toBe('erai-raws');
    expect(r.episode).toBe(1);
    expect(r.resolution).toBe('1080p');
    expect(r.dub).toBe(false);
  });

  it('parses a scene-style anime release with season and episode', async () => {
    const r = await parseRelease('Demon.Slayer_.Kimetsu.no.Yaiba.S01E01.WEBRip.Netflix');
    expect(r.season).toBe(1);
    expect(r.episode).toBe(1);
    expect(r.source).toBe('web');
  });

  it('flags a dub-timed release', async () => {
    const r = await parseRelease('Demon Slayer - S01E01 - Cruelty [KaiDubs] [1080p]');
    expect(r.dub).toBe(true);
  });

  it('flags SDH and dub together', async () => {
    const r = await parseRelease('Demon Slayer S01 NF [EP01-26] English[CC] OR Dub[SDH]');
    expect(r.sdh).toBe(true);
    expect(r.dub).toBe(true);
  });

  it('flags [CC] as SDH without assuming a dub', async () => {
    const r = await parseRelease('Demon Slayer - S01E26.[BD]English[CC]');
    expect(r.sdh).toBe(true);
    expect(r.dub).toBe(false);
    expect(r.source).toBe('bluray');
  });

  it('does not treat dual audio as a dub marker', async () => {
    const r = await parseRelease('[SubsPlease] Frieren - 01 (1080p) [Dual Audio]');
    expect(r.dub).toBe(false);
    expect(r.group).toBe('subsplease');
  });

  it('parses a live-action movie release with year and group', async () => {
    const r = await parseRelease('The.Shawshank.Redemption.1994.1080p.BluRay.x264-AMIABLE');
    expect(r.year).toBe(1994);
    expect(r.resolution).toBe('1080p');
    expect(r.source).toBe('bluray');
  });

  it('returns an empty parse for a blank name rather than throwing', async () => {
    const r = await parseRelease('');
    expect(r.parser).toBe('none');
    expect(r.confidence).toBe(0);
  });
});

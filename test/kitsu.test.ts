import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearKitsuCache, imdbPathFor, kitsuToImdb } from '../src/upstream/kitsu.js';
import { fetchForRequest } from '../src/upstream/fetch.js';

const META = {
  meta: {
    imdb_id: 'tt9335498',
    videos: [
      { id: 'kitsu:41370:18', imdb_id: 'tt9335498', imdbSeason: 1, imdbEpisode: 18 },
      // A later Kitsu entry that is really IMDb season 3, numbered from 1.
      { id: 'kitsu:44081:2', imdbSeason: 3, imdbEpisode: 2 },
    ],
  },
};

function stub(handler: (url: string) => unknown) {
  const fn = vi.fn(async (url: string | URL) => {
    const value = handler(String(url));
    if (value === undefined) return { ok: false, status: 404 } as Response;
    return { ok: true, status: 200, json: async () => value } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearKitsuCache();
});

describe('kitsuToImdb', () => {
  it('maps an episode to its IMDb season and episode', async () => {
    stub((u) => (u.includes('/meta/series/kitsu:41370.json') ? META : undefined));
    expect(await kitsuToImdb('kitsu:41370:18')).toBe('tt9335498:1:18');
  });

  it('falls back to the series IMDb id when a video omits its own', async () => {
    stub((u) => (u.includes('kitsu:44081') ? META : undefined));
    expect(await kitsuToImdb('kitsu:44081:2')).toBe('tt9335498:3:2');
  });

  it('returns null for unknown episodes, non-Kitsu ids and a failed lookup', async () => {
    stub(() => undefined);
    expect(await kitsuToImdb('kitsu:41370:99')).toBeNull();
    expect(await kitsuToImdb('tt9335498:1:18')).toBeNull();
  });

  it('caches the series meta', async () => {
    const fn = stub(() => META);
    await kitsuToImdb('kitsu:41370:18');
    await kitsuToImdb('kitsu:41370:18');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('imdbPathFor', () => {
  it('keeps the extras segment', async () => {
    stub(() => META);
    expect(await imdbPathFor('/subtitles/series/kitsu:41370:18/filename=x.mkv.json')).toBe(
      '/subtitles/series/tt9335498:1:18/filename=x.mkv.json',
    );
  });

  it('leaves IMDb paths alone', async () => {
    const fn = stub(() => META);
    expect(await imdbPathFor('/subtitles/series/tt9335498:1:18.json')).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('fetchForRequest', () => {
  it('queries both forms of a Kitsu id and merges them', async () => {
    stub((u) => {
      if (u.includes('/meta/')) return META;
      if (u.includes('tt9335498:1:18')) {
        return { subtitles: [
          { id: '1', url: 'https://cdn/a.srt', lang: 'eng' },
          { id: '2', url: 'https://cdn/shared.srt', lang: 'eng' },
        ] };
      }
      if (u.includes('kitsu:41370:18')) {
        return { subtitles: [{ id: '3', url: 'https://cdn/shared.srt', lang: 'eng' }] };
      }
      return undefined;
    });
    const r = await fetchForRequest(['https://up.example'], '/subtitles/series/kitsu:41370:18.json');
    expect(r.resolvedPath).toBe('/subtitles/series/tt9335498:1:18.json');
    expect(r.subtitles.map((s) => s.url)).toEqual(['https://cdn/a.srt', 'https://cdn/shared.srt']);
    expect(r.failed).toHaveLength(0);
  });

  it('still serves the original query when the mapping lookup fails', async () => {
    stub((u) =>
      u.includes('kitsu:41370:18') && !u.includes('/meta/')
        ? { subtitles: [{ id: '1', url: 'https://cdn/a.srt', lang: 'eng' }] }
        : undefined,
    );
    const r = await fetchForRequest(['https://up.example'], '/subtitles/series/kitsu:41370:18.json');
    expect(r.resolvedPath).toBeNull();
    expect(r.subtitles).toHaveLength(1);
  });
});

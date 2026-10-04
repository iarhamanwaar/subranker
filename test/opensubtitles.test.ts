import { describe, expect, it, vi } from 'vitest';
import { downloadFile, searchByHash, toRawSubtitles } from '../src/upstream/opensubtitles.js';

const SEARCH = {
  data: [
    {
      id: '1',
      type: 'subtitle',
      attributes: {
        language: 'en',
        release: 'Demon.Slayer.S04E04.1080p.AMZN.WEB-DL-KQRM',
        moviehash_match: true,
        files: [{ file_id: 555, file_name: 'ds.s04e04.srt' }],
      },
    },
    {
      id: '2',
      type: 'subtitle',
      attributes: {
        language: 'en',
        release: 'Demon.Slayer.S04E04.720p',
        moviehash_match: false,
        files: [{ file_id: 777 }],
      },
    },
    { id: '3', type: 'subtitle', attributes: { language: 'en', files: [] } }, // no file -> skipped
  ],
};

describe('toRawSubtitles', () => {
  it('maps hits to proxy URLs and marks hash matches', () => {
    const subs = toRawSubtitles(SEARCH, 'https://subs.example');
    expect(subs).toHaveLength(2);
    expect(subs[0]).toMatchObject({
      url: 'https://subs.example/os/555.srt',
      lang: 'en',
      releaseName: 'Demon.Slayer.S04E04.1080p.AMZN.WEB-DL-KQRM',
      moviehash: true,
      upstream: 'opensubtitles-api',
    });
    // non-hash-match hit carries no moviehash flag
    expect(subs[1]!.moviehash).toBeUndefined();
    expect(subs[1]!.url).toBe('https://subs.example/os/777.srt');
  });
});

describe('searchByHash', () => {
  it('queries the API with the hash + language and returns raw subs', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => SEARCH,
    })) as unknown as typeof fetch;
    const subs = await searchByHash({
      apiKey: 'K', hash: 'abc', langs: ['en'], proxyBase: 'https://subs.example', fetchImpl,
    });
    expect(subs).toHaveLength(2);
    const calledUrl = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('moviehash=abc');
    expect(calledUrl).toContain('languages=en');
  });

  it('returns [] when the hash is missing', async () => {
    const subs = await searchByHash({ apiKey: 'K', hash: undefined, langs: ['en'], proxyBase: 'x' });
    expect(subs).toEqual([]);
  });
});

describe('downloadFile', () => {
  it('POSTs the file id and fetches the resolved link', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/download')) return { ok: true, json: async () => ({ link: 'https://dl.example/x.srt' }) };
      return { ok: true, text: async () => 'WEBVTT\n\n1\n00:00:01,000 --> 00:00:02,000\nHi' };
    }) as unknown as typeof fetch;
    const text = await downloadFile({ apiKey: 'K', fileId: '555', fetchImpl });
    expect(text).toContain('Hi');
    expect(calls.some((u) => u.endsWith('/download'))).toBe(true);
    expect(calls.some((u) => u === 'https://dl.example/x.srt')).toBe(true);
  });
});

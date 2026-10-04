import { strToU8, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { downloadSubdl, extractSrt, searchSubdl, toRawSubtitles, zipIdFromUrl } from '../src/upstream/subdl.js';

const RESP = {
  status: true,
  subtitles: [
    { release_name: 'DemonSlayerKimetsunoYaibaSwordsmithVillageArcEp04', language: 'EN', url: '/subtitle/3071076-3080524.zip?api_key=K' },
    { release_name: 'Demon Slayer S04 English Dub CC/SDH [spam link]', language: 'EN', url: '/subtitle/3664307-8581100.zip?api_key=K' },
  ],
};

describe('zipIdFromUrl', () => {
  it('extracts the zip id', () => {
    expect(zipIdFromUrl('/subtitle/3071076-3080524.zip?api_key=K')).toBe('3071076-3080524');
  });
  it('returns null for an unexpected url', () => {
    expect(zipIdFromUrl('/nope')).toBeNull();
  });
});

describe('toRawSubtitles', () => {
  it('maps subs to proxy URLs and drops dubs', () => {
    const subs = toRawSubtitles(RESP, 'https://subs.example');
    expect(subs).toHaveLength(1); // the dub/CC entry is dropped
    expect(subs[0]).toMatchObject({
      url: 'https://subs.example/subdl/3071076-3080524.srt',
      lang: 'eng',
      releaseName: 'DemonSlayerKimetsunoYaibaSwordsmithVillageArcEp04',
      upstream: 'subdl',
    });
  });
});

describe('extractSrt', () => {
  it('pulls the .srt out of a zip', () => {
    const zip = zipSync({ '04en.srt': strToU8('1\n00:00:01,000 --> 00:00:02,000\nHi there') });
    expect(extractSrt(zip)).toContain('Hi there');
  });
});

describe('searchSubdl', () => {
  it('queries the API with imdb/season/episode and returns raw subs', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => RESP })) as unknown as typeof fetch;
    const subs = await searchSubdl({
      apiKey: 'K', imdbId: 'tt9335498', season: 4, episode: 4,
      langs: ['en'], proxyBase: 'https://subs.example', fetchImpl,
    });
    expect(subs).toHaveLength(1);
    const url = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as string;
    expect(url).toContain('imdb_id=tt9335498');
    expect(url).toContain('season_number=4');
    expect(url).toContain('episode_number=4');
  });
});

describe('downloadSubdl', () => {
  it('fetches the zip and extracts the subtitle', async () => {
    const zip = zipSync({ 'x.srt': strToU8('cue content here') });
    const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => zip.buffer })) as unknown as typeof fetch;
    const text = await downloadSubdl({ apiKey: 'K', zipId: '1-2', fetchImpl });
    expect(text).toContain('cue content here');
  });
});

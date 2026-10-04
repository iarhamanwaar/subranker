import { describe, expect, it } from 'vitest';
import { runHarness, subPath } from '../src/harness/run.js';
import type { Fixture } from '../src/harness/types.js';

const fx: Fixture = {
  label: 'DS S4E4', id: 'tt9335498:4:4', filename: 'a b.mkv',
  videoHash: 'abc', videoSize: 123, lang: 'en', expectedRuntimeMax: 3000,
};
const srt = new Array(300).fill(0)
  .map((_, i) => `${i}\n00:${String(Math.floor(i / 15)).padStart(2, '0')}:${String((i * 4) % 60).padStart(2, '0')},000 --> 00:00:01,000\nx`)
  .join('\n\n');

describe('subPath', () => {
  it('encodes id and extras like Stremio', () => {
    expect(subPath(fx)).toBe('/subtitles/series/tt9335498%3A4%3A4/filename=a%20b.mkv&videoSize=123&videoHash=abc.json');
  });
});

describe('runHarness', () => {
  it('passes a correct English episode', async () => {
    const rep = await runHarness([fx], {
      fetchSubs: async () => [{ id: '1', url: 'u', lang: 'eng' }],
      fetchText: async () => srt,
    });
    expect(rep.passed).toBe(1);
    expect(rep.passRate).toBe(1);
  });
  it('fails gracefully on an empty subtitle list', async () => {
    const rep = await runHarness([fx], { fetchSubs: async () => [], fetchText: async () => '' });
    expect(rep.passed).toBe(0);
    expect(rep.episodes[0]!.checks.some((c) => c.status === 'fail')).toBe(true);
  });
  it('fails gracefully when the download throws', async () => {
    const rep = await runHarness([fx], {
      fetchSubs: async () => [{ id: '1', url: 'u', lang: 'eng' }],
      fetchText: async () => { throw new Error('timeout'); },
    });
    expect(rep.passed).toBe(0);
  });
  it('continues to the next fixture when one fetchSubs throws', async () => {
    const second: Fixture = { ...fx, label: 'ok', id: 'tt9335498:4:5' };
    let n = 0;
    const rep = await runHarness([fx, second], {
      fetchSubs: async () => {
        n += 1;
        if (n === 1) throw new Error('addon timeout');
        return [{ id: '1', url: 'u', lang: 'eng' }];
      },
      fetchText: async () => srt,
    });
    expect(rep.total).toBe(2);
    expect(rep.passed).toBe(1);
    expect(rep.episodes[0]!.pass).toBe(false);
    expect(rep.episodes[0]!.checks.some((c) => c.name === 'fetch' && c.status === 'fail')).toBe(true);
    expect(rep.episodes[1]!.pass).toBe(true);
  });
});

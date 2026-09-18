import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUpstreams } from '../src/upstream/fetch.js';

function mockFetch(responses: Record<string, unknown | Error>) {
  return vi.fn(async (url: string | URL) => {
    const key = String(url);
    const match = Object.keys(responses).find((k) => key.startsWith(k));
    const value = match ? responses[match] : undefined;
    if (value instanceof Error) throw value;
    if (value === undefined) return { ok: false, status: 404 } as Response;
    return { ok: true, status: 200, json: async () => value } as unknown as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

const PATH = '/subtitles/movie/tt1.json';

describe('fetchUpstreams', () => {
  it('merges results from several upstreams', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'https://a.example': { subtitles: [{ id: '1', url: 'https://cdn/a.srt', lang: 'eng' }] },
      'https://b.example': { subtitles: [{ id: '1', url: 'https://cdn/b.srt', lang: 'eng' }] },
    }));
    const r = await fetchUpstreams(['https://a.example', 'https://b.example'], PATH);
    expect(r.subtitles).toHaveLength(2);
    expect(r.ok).toHaveLength(2);
    expect(r.failed).toHaveLength(0);
  });

  it('namespaces ids so identical upstream ids do not collide', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'https://a.example': { subtitles: [{ id: 'x', url: 'https://cdn/a.srt', lang: 'eng' }] },
      'https://b.example': { subtitles: [{ id: 'x', url: 'https://cdn/b.srt', lang: 'eng' }] },
    }));
    const r = await fetchUpstreams(['https://a.example', 'https://b.example'], PATH);
    expect(new Set(r.subtitles.map((s) => s.id)).size).toBe(2);
    expect(r.subtitles.map((s) => s.upstream)).toEqual(['a', 'b']);
  });

  it('deduplicates the same file offered by both upstreams', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'https://a.example': { subtitles: [{ id: '1', url: 'https://cdn/same.srt', lang: 'eng' }] },
      'https://b.example': { subtitles: [{ id: '2', url: 'https://cdn/same.srt', lang: 'eng' }] },
    }));
    const r = await fetchUpstreams(['https://a.example', 'https://b.example'], PATH);
    expect(r.subtitles).toHaveLength(1);
  });

  it('degrades rather than empties when one upstream fails', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'https://a.example': { subtitles: [{ id: '1', url: 'https://cdn/a.srt', lang: 'eng' }] },
      'https://b.example': new Error('boom'),
    }));
    const r = await fetchUpstreams(['https://a.example', 'https://b.example'], PATH);
    expect(r.subtitles).toHaveLength(1);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]!.base).toBe('https://b.example');
  });

  it('reports an upstream that answers with an error status', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'https://a.example': undefined }));
    const r = await fetchUpstreams(['https://a.example'], PATH);
    expect(r.subtitles).toHaveLength(0);
    expect(r.failed[0]!.error).toBe('HTTP 404');
  });
});

describe('verification timeout guard', () => {
  it('falls back to the default when the timeout is missing or invalid', async () => {
    const { fetchAndInspect, DEFAULT_FETCH_OPTIONS } = await import('../src/verify/fetch.js');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode('1\n00:00:01,000 --> 00:00:02,000\nhi\n').buffer,
    })));
    // setTimeout(fn, undefined) fires immediately, which would abort every
    // request and make verification look instantaneous while doing nothing.
    const r = await fetchAndInspect('https://example.com/a.srt', {
      ...DEFAULT_FETCH_OPTIONS,
      timeoutMs: undefined as unknown as number,
    });
    expect(r.verification.ok).toBe(true);
  });
});

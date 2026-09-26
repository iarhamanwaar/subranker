import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildManifest } from '../src/manifest.js';
import { expand } from '../src/watchorder/playlist.js';
import { arcLabel, pat, titleLabel } from '../src/watchorder/styles.js';
import { WatchOrderStore } from '../src/watchorder/store.js';
import type { Franchise, SourceMeta } from '../src/watchorder/types.js';

const TODAY = '2026-09-26';
const ep = (s: number, e: number, released: string, name = `Ep ${s}x${e}`) => ({
  id: `tt1:${s}:${e}`, season: s, episode: e, name, released: `${released}T00:00:00.000Z`, overview: `About ${s}x${e}.`,
});
const SOURCES: Record<string, SourceMeta> = {
  'series/tt1': {
    id: 'tt1', name: 'Show',
    videos: [ep(1, 2, '2020-01-08'), ep(1, 1, '2020-01-01'), ep(2, 1, '2021-01-01'), ep(0, 1, '2020-06-01', 'Short'),
      ep(3, 1, '2027-01-01')], // not aired yet
  },
  'movie/tt9': { id: 'tt9', name: 'The Movie', released: '2020-10-16T00:00:00.000Z', runtime: '117 min', description: 'A film.' },
  'movie/tt8': { id: 'tt8', name: 'Next Movie', released: '2026-12-18T00:00:00.000Z', runtime: '150 min' },
};
const get = async (type: 'movie' | 'series', id: string) => {
  const m = SOURCES[`${type}/${id}`];
  if (!m) throw new Error(`no ${type}/${id}`);
  return m;
};

const group = (num: string, name: string) => ({ num, name, color: '#123456', pattern: pat.solid('#123456') });
const anime: Franchise = {
  id: 'show', name: 'Show · Watch Order', style: 'anime', releaseInfo: '2020–', description: 'd', poster: 'p', background: 'b', logo: 'l',
  groups: { 1: group('壱', 'First Arc'), 2: group('弐', 'Second Arc') },
  plan: [
    [1, [{ series: 'tt1', seasons: [1] }, { movie: 'tt9' }, { series: 'tt1', ids: ['tt1:0:1'], optional: true, optionalName: 'Shorts' }]],
    [2, [{ series: 'tt1', seasonsFrom: 2 }, { movie: 'tt8' }]],
  ],
  label: arcLabel({ groupsTotal: 2, optionalName: 'Shorts' }),
};

describe('expand', () => {
  it('orders episodes, places movies and optional items, and renumbers per season', async () => {
    const v = await expand(anime, get, TODAY);
    expect(v.map((x) => `${x.season}.${x.episode} ${x.id}`)).toEqual([
      '1.1 tt1:1:1', '1.2 tt1:1:2', '1.3 tt9', '1.4 tt1:0:1', '2.1 tt1:2:1',
    ]);
  });

  it('leaves out what has not aired, so it appears on a later rebuild', async () => {
    const v = await expand(anime, get, TODAY);
    expect(v.find((x) => x.id === 'tt8')).toBeUndefined();
    expect(v.find((x) => x.id === 'tt1:3:1')).toBeUndefined();
    const later = await expand(anime, get, '2027-02-01');
    expect(later.map((x) => x.id)).toEqual(expect.arrayContaining(['tt8', 'tt1:3:1']));
  });

  it('counts optional items apart from the arc, and labels them grey', async () => {
    const v = await expand(anime, get, TODAY);
    const movie = v.find((x) => x.id === 'tt9')!;
    expect(movie.title).toBe('MOVIE · The Movie');
    expect(movie.overview.startsWith('Arc 1 of 2: First Arc · 3 of 3 · 1h57.')).toBe(true);
    expect(movie.label).toMatchObject({ mode: 'ribbon', main: 'MOVIE', rt: '1h57' });
    const short = v.find((x) => x.id === 'tt1:0:1')!;
    expect(short.optional).toBe(true);
    expect(short.title).toBe('OPTIONAL · Short');
    expect(short.label).toMatchObject({ mode: 'tag', sub: 'Optional', main: 'Shorts', pos: '1/1' });
    expect(short.groupColor).toBe('#5d5a6e');
  });

  it('labels western titles by short name, order number and episode', async () => {
    const western: Franchise = {
      ...anime, style: 'western',
      plan: [[1, [{ movie: 'tt9', short: 'Movie' }, { series: 'tt1', seasons: [1, 2], short: 'Show' }]]],
      label: titleLabel({ word: 'Phase', numOf: String }),
    };
    const v = await expand(western, get, TODAY);
    expect(v[0]!.label).toMatchObject({ num: '1', sub: 'Phase 1 · Film', main: 'Movie', pos: '#1' });
    expect(v[1]!.title).toBe('Show S1 · Ep 1x1');
    expect(v[1]!.label).toMatchObject({ sub: 'Phase 1 · Series S1', pos: 'E1/2' });
  });

  it('counts a hand-picked set within the set, not within its season', async () => {
    const western: Franchise = {
      ...anime, style: 'western',
      plan: [[1, [{ series: 'tt1', ids: ['tt1:1:2', 'tt1:2:1'], short: 'Show' }]]],
      label: titleLabel({ word: 'Era', numOf: String }),
    };
    const v = await expand(western, get, TODAY);
    expect(v.map((x) => (x.label as { pos: string }).pos)).toEqual(['1/2', '2/2']);
  });

  it('numbers titles among those already out', async () => {
    const western: Franchise = {
      ...anime, style: 'western',
      plan: [[1, [{ movie: 'tt9', short: 'Movie' }, { movie: 'tt8', short: 'Next' }, { series: 'tt1', seasons: [2], short: 'Show' }]]],
      label: titleLabel({ word: 'Phase', numOf: String }),
    };
    const v = await expand(western, get, TODAY);
    expect(v[0]!.overview.startsWith('Phase 1 · #1 of 2 ·')).toBe(true);
    expect(v[1]!.label).toMatchObject({ pos: 'E1/1' });
    expect(v[1]!.overview.startsWith('Phase 1 · #2 ·')).toBe(true);
    const later = await expand(western, get, '2027-02-01');
    expect(later[0]!.overview.startsWith('Phase 1 · #1 of 3 ·')).toBe(true);
  });

  it('keeps descriptions to what the TV can show', async () => {
    const long = { ...SOURCES['movie/tt9']!, description: 'word '.repeat(200) };
    const v = await expand({ ...anime, plan: [[1, [{ movie: 'tt9' }]]] }, async () => long, TODAY);
    expect(v[0]!.overview.length).toBeLessThanOrEqual(241);
    expect(v[0]!.overview.endsWith('…')).toBe(true);
  });
});

describe('manifest', () => {
  it('adds the row and playlist metadata only when enabled', () => {
    const off = buildManifest({ name: 'SubRanker' });
    expect(off.catalogs).toEqual([]);
    expect(off.resources).toEqual(['subtitles']);
    const on = buildManifest({ name: 'SubRanker', watchOrder: true });
    expect(on.catalogs).toEqual([{ type: 'series', id: 'watchorder', name: 'Watch Order' }]);
    expect(on.resources).toContainEqual({ name: 'meta', types: ['series'], idPrefixes: ['wo-'] });
  });

  it('never adds the row to a rank-pinned instance', () => {
    const pinned = buildManifest({ name: 'SubRanker', rank: 1, watchOrder: true });
    expect(pinned.catalogs).toEqual([]);
  });
});

describe('store', () => {
  let server: Server;
  let port: number;
  const dir = mkdtempSync(join(tmpdir(), 'wo-'));

  const get = (path: string, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }>((resolve, reject) => {
      request({ port, path, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
      }).on('error', reject).end();
    });

  beforeAll(async () => {
    mkdirSync(join(dir, 'img'));
    writeFileSync(join(dir, 'img', 'aaaaaaaaaaaaaaaaaaaa.jpg'), Buffer.from('jpeg'));
    writeFileSync(join(dir, 'index.json'), JSON.stringify({
      builtAt: 'now', catalog: [{ id: 'wo-show', type: 'series', name: 'Show' }],
      metas: { 'wo-show': { id: 'wo-show', type: 'series', name: 'Show', videos: [] } },
    }));
    const store = new WatchOrderStore(dir);
    store.reload();
    server = createServer((req, res) => {
      const path = new URL(req.url!, 'http://x').pathname;
      if (store.handleImage(req, res, path) || store.handle(req, res, path)) return;
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => server.close());

  it('serves the catalog compressed, with a validator', async () => {
    const res = await get('/catalog/series/watchorder.json', { 'accept-encoding': 'gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(gunzipSync(res.body).toString()).metas[0].id).toBe('wo-show');
    const again = await get('/catalog/series/watchorder.json', { 'if-none-match': String(res.headers.etag) });
    expect(again.status).toBe(304);
  });

  it('serves a playlist and 404s an unknown one', async () => {
    expect((await get('/meta/series/wo-show.json')).status).toBe(200);
    expect((await get('/meta/series/wo-nope.json')).status).toBe(404);
  });

  it('serves images as immutable and refuses anything but a hash name', async () => {
    const img = await get('/wo/img/aaaaaaaaaaaaaaaaaaaa.jpg');
    expect(img.status).toBe(200);
    expect(img.headers['cache-control']).toContain('immutable');
    expect((await get('/wo/img/..%2Findex.json')).status).toBe(404);
    expect((await get('/wo/img/index.json')).status).toBe(404);
  });
});

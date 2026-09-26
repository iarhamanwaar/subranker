/**
 * The playlist builder. Runs as its own low-priority process (see
 * scheduler.ts), never inside the server: rendering is CPU-bound and would
 * delay subtitle requests.
 *
 * Output, all under WATCH_ORDER_DIR:
 *   index.json    every playlist's catalog entry and meta, swapped in whole
 *   img/<hash>.*  thumbnails, posters and logos, named by what they depict
 *
 * Images are named by a hash of their inputs, so an unchanged thumbnail is
 * never rendered twice and clients can cache every image forever. A nightly
 * run only renders what is new: this week's episode, a film that came out.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cinemetaClient } from './cinemeta.js';
import { FRANCHISES } from './franchises/index.js';
import { expand } from './playlist.js';
import { renderLogo, renderPoster, renderThumb } from './thumb.js';
import type { Franchise, PlaylistVideo } from './types.js';

/** Bump when the rendering changes, so every image is redrawn once. */
const RENDER_VERSION = 5;

export interface BuiltIndex {
  builtAt: string;
  catalog: Array<Record<string, unknown>>;
  metas: Record<string, Record<string, unknown>>;
}

const hash = (v: unknown) => createHash('sha1').update(JSON.stringify([RENDER_VERSION, v])).digest('hex').slice(0, 20);

/**
 * Fetch a source image. `missing` is a real 404 (many older anime episodes
 * have no still), which is final. `failed` is anything else (throttling,
 * timeouts), which is worth retrying on the next run.
 */
type Fetched = { buf: Buffer } | { missing: true } | { failed: true };

async function fetchImage(url: string | undefined): Promise<Fetched> {
  if (!url) return { missing: true };
  for (let attempt = 0; attempt < 5; attempt++) {
    let wait = 2000 * 2 ** attempt;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()) };
      // Drain the body: an unread response keeps its connection open, and a
      // long build would pile up hundreds of them.
      await res.body?.cancel();
      if (res.status === 404 || res.status === 410) return { missing: true };
      const after = Number(res.headers.get('retry-after'));
      if (after > 0) wait = Math.min(after * 1000, 60_000);
    } catch {
      // retried below
    }
    await new Promise((r) => setTimeout(r, wait));
  }
  return { failed: true };
}

export async function build(opts: { dir: string; publicUrl: string; today?: string; only?: string[]; log?: (s: string) => void }) {
  const log = opts.log ?? ((s: string) => console.log(`[watch-order] ${s}`));
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const imgDir = join(opts.dir, 'img');
  mkdirSync(imgDir, { recursive: true });
  const get = cinemetaClient(join(opts.dir, 'cache'));
  const used = new Set<string>();
  const imgUrl = (name: string) => `${opts.publicUrl}/wo/img/${name}`;
  let rendered = 0;
  let missing = 0;

  // Images drawn with a stand-in because their source failed to load. They
  // are drawn again on the next run, so the real picture arrives by itself.
  const provisionalFile = join(opts.dir, 'provisional.json');
  const wasProvisional = new Set<string>(existsSync(provisionalFile) ? (JSON.parse(readFileSync(provisionalFile, 'utf8')) as string[]) : []);
  const provisional = new Set<string>();

  // Render once per distinct input; later runs find the file and skip it.
  async function image(key: unknown, ext: 'jpg' | 'png', render: () => Promise<{ buf: Buffer; final: boolean }>): Promise<string> {
    const name = `${hash(key)}.${ext}`;
    used.add(name);
    const file = join(imgDir, name);
    if (!existsSync(file) || wasProvisional.has(name)) {
      const { buf, final } = await render();
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, buf);
      renameSync(tmp, file);
      rendered++;
      if (!final) provisional.add(name);
    }
    return name;
  }

  const index: BuiltIndex = { builtAt: new Date().toISOString(), catalog: [], metas: {} };
  const franchises = FRANCHISES.filter((f) => !opts.only || opts.only.includes(f.id));

  for (const f of franchises) {
    const started = Date.now();
    const videos = await expand(f, get, today);
    const poster = await image(['poster', f.poster, patterns(f)], 'jpg', async () => {
      const src = await fetchImage(f.poster);
      if (!('buf' in src)) throw new Error(`${f.id}: poster unavailable`);
      return { buf: await renderPoster({ image: src.buf, patterns: patterns(f) }), final: true };
    });
    const logoSpec = f.logo;
    const logo = typeof logoSpec === 'string' ? logoSpec
      : imgUrl(await image(['logo', logoSpec], 'png', async () => ({ buf: await renderLogo(logoSpec), final: true })));

    const out = [];
    let backdrop: Buffer | undefined;
    for (const v of videos) {
      const thumb = await image(['thumb', f.style, v.source, v.label, v.groupColor, v.groupPattern], 'jpg', async () => {
        // Many older anime episodes have no still on the image host; the
        // show's own backdrop beats a blank card.
        const got = await fetchImage(v.source);
        let src: Buffer | undefined;
        if ('buf' in got) src = got.buf;
        else {
          missing++;
          if (!backdrop) { const b = await fetchImage(f.background); if ('buf' in b) backdrop = b.buf; }
          src = backdrop;
        }
        const buf = await renderThumb({ image: src, style: f.style, label: v.label, color: v.groupColor, pattern: v.groupPattern });
        return { buf, final: !('failed' in got) };
      });
      out.push(videoJson(v, imgUrl(thumb)));
    }

    const id = `wo-${f.id}`;
    const meta = {
      id, type: 'series', name: f.name, poster: imgUrl(poster), background: f.background, logo,
      description: f.description, releaseInfo: f.releaseInfo, videos: out,
    };
    index.metas[id] = meta;
    index.catalog.push({ id, type: 'series', name: f.name, poster: meta.poster, posterShape: 'poster', background: f.background, logo, description: f.description, releaseInfo: f.releaseInfo });
    log(`${f.id}: ${videos.length} videos in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  const file = join(opts.dir, 'index.json');
  // A partial build (WATCH_ORDER_ONLY) keeps the other playlists as they were.
  if (opts.only && existsSync(file)) {
    const prev = JSON.parse(readFileSync(file, 'utf8')) as BuiltIndex;
    const mine = new Set(Object.keys(index.metas));
    index.metas = { ...Object.fromEntries(Object.entries(prev.metas).filter(([id]) => !mine.has(id))), ...index.metas };
    const order = FRANCHISES.map((f) => `wo-${f.id}`);
    index.catalog = [...prev.catalog.filter((c) => !mine.has(String(c.id))), ...index.catalog]
      .sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));
  }
  writeFileSync(`${file}.tmp`, JSON.stringify(index));
  renameSync(`${file}.tmp`, file);

  // A partial build leaves other playlists' provisional images for later.
  const keep = opts.only ? [...wasProvisional].filter((n) => !used.has(n)) : [];
  writeFileSync(provisionalFile, JSON.stringify([...provisional, ...keep]));

  // Remove images nothing references any more, but only after a full build:
  // a partial one would delete thumbnails still in use.
  let pruned = 0;
  if (!opts.only) {
    for (const name of readdirSync(imgDir)) {
      if (!used.has(name)) { unlinkSync(join(imgDir, name)); pruned++; }
    }
  }
  log(`done: ${franchises.length} playlists, ${rendered} images rendered, ${missing} without a still (${provisional.size} to retry next run), ${pruned} pruned`);
  return index;
}

function patterns(f: Franchise) {
  return Object.keys(f.groups).map(Number).sort((a, b) => a - b).map((g) => f.groups[g]!.pattern);
}

function videoJson(v: PlaylistVideo, thumbnail: string) {
  return {
    id: v.id, title: v.title, season: v.season, episode: v.episode, thumbnail, overview: v.overview,
    // Omitted rather than sent empty: the TV renders a zero date as "Jan 1, 1970".
    ...(v.released ? { released: `${v.released}T00:00:00.000Z` } : {}),
  };
}

// Entry point when run as the builder process.
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.env.WATCH_ORDER_DIR ?? './data/watch-order';
  const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  if (!publicUrl) {
    console.error('[watch-order] PUBLIC_URL is required: thumbnails need absolute URLs');
    process.exit(1);
  }
  const only = process.env.WATCH_ORDER_ONLY?.split(',').filter(Boolean);
  build({ dir, publicUrl, ...(only?.length ? { only } : {}) }).catch((err) => {
    console.error('[watch-order] build failed:', err);
    process.exit(1);
  });
}

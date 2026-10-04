/**
 * HTTP entry point.
 *
 * Routes:
 *   /configure                        the setup page
 *   /manifest.json                    instance configured from the environment
 *   /c/<config>/manifest.json         instance configured from the URL
 *   /c/<config>/r/<n>/manifest.json   one instance per ranked position
 *   /subtitles/...                    the ranked list (same prefixes apply)
 *   /shift/...                        a repaired subtitle file
 *
 * Only subtitle routes are served. Proxying anything else would re-serve the
 * upstream's stream results — backed by the operator's paid debrid account —
 * to anyone who found this host.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig, type Config } from './config.js';
import { applyUrlConfig, parseRoute } from './config-url.js';
import { configurePage } from './configure.js';
import { buildManifest } from './manifest.js';
import { logoSvg } from './logo.js';
import { buildProbeSubtitles } from './label/probe.js';
import { runPipeline, type RequestIdentity } from './pipeline.js';
import { episodeTitleFor, parseSeriesId } from './meta/episode.js';
import { arcKeywords, foreignArcKeywords } from './meta/arcs.js';
import { hasArcBearingSub, hasTitleBearingSub } from './score/score.js';
import { fetchShifted, parseShiftPath } from './shift/route.js';
import { fetchForRequest } from './upstream/fetch.js';
import { downloadFile, searchByHash } from './upstream/opensubtitles.js';
import { downloadSubdl, searchSubdl } from './upstream/subdl.js';
import type { RequestExtras } from './types.js';
import { WatchOrderStore } from './watchorder/store.js';
import { startScheduler } from './watchorder/scheduler.js';

/**
 * Parse Stremio's extras segment.
 *
 * Stremio appends extras between the id and `.json`, e.g.
 * `/subtitles/series/tt9335498:1:1/videoHash=…&videoSize=…&filename=….json`.
 * Some clients omit the segment, so every field is optional and the pipeline
 * degrades to metadata ranking when they are missing.
 */
export function parseExtras(segment: string | undefined): RequestExtras {
  if (!segment) return {};
  const extras: RequestExtras = {};
  for (const pair of segment.split('&')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx);
    const value = decodeURIComponent(pair.slice(idx + 1));
    if (key === 'videoHash') extras.videoHash = value;
    else if (key === 'videoSize') extras.videoSize = Number(value) || undefined;
    else if (key === 'filename') extras.filename = value;
  }
  return extras;
}

/** Split `/subtitles/series/tt1:1:1/extras.json` into its parts. */
export function parseSubtitlePath(
  pathname: string,
): { type: string; id: string; extras: RequestExtras } | null {
  const m = /^\/subtitles\/([^/]+)\/(.+)\.json$/.exec(pathname);
  if (!m) return null;
  const type = m[1]!;
  const rest = m[2]!;
  const slash = rest.indexOf('/');
  if (slash === -1) return { type, id: decodeURIComponent(rest), extras: {} };
  return {
    type,
    id: decodeURIComponent(rest.slice(0, slash)),
    extras: parseExtras(rest.slice(slash + 1)),
  };
}

/**
 * The same subtitle path with the series id's season number changed, keeping
 * the episode and the extras segment. Handles both the plain `:` and the
 * percent-encoded `%3A` forms a client may send.
 */
export function withSeason(
  rest: string,
  imdbId: string,
  fromSeason: number,
  toSeason: number,
  episode: number,
): string {
  const plain = `${imdbId}:${fromSeason}:${episode}`;
  if (rest.includes(plain)) return rest.replace(plain, `${imdbId}:${toSeason}:${episode}`);
  const enc = `${imdbId}%3A${fromSeason}%3A${episode}`;
  return rest.replace(enc, `${imdbId}%3A${toSeason}%3A${episode}`);
}

interface CacheEntry {
  at: number;
  body: string;
}

/**
 * Cap on cached responses.
 *
 * The cache is keyed partly on caller-supplied config, so an unbounded map is
 * a memory-exhaustion lever: anyone can mint endless distinct keys by varying
 * their config segment. Oldest entries are evicted first.
 */
const MAX_CACHE_ENTRIES = 2000;

/**
 * Everything about a config that changes the response.
 *
 * Keying on the upstreams alone would serve one user's results to another who
 * shares those upstreams but asked for different processing.
 */
function cacheFingerprint(c: Config): string {
  return [
    c.upstreamBases.join(','),
    c.maxResults,
    c.verify ? 1 : 0,
    c.verifyLimit,
    c.dropMismatches ? 1 : 0,
    c.autoShift ? 1 : 0,
    c.removeHearingImpaired ? 1 : 0,
    c.fixUppercase ? 1 : 0,
    c.fixOcr ? 1 : 0,
    c.fixOverlaps ? 1 : 0,
    c.demoteForced ? 1 : 0,
    c.relabel ? 1 : 0,
    c.publicUrl,
  ].join('|');
}

/**
 * `watchOrder` is present only when the server runs the playlist builder
 * (WATCH_ORDER=on). A user's URL config can switch the row off for their
 * install, but cannot switch on what this server does not build.
 */
export function createApp(base: Config, deps: { watchOrder?: WatchOrderStore } = {}) {
  const cache = new Map<string, CacheEntry>();
  // Downloaded OpenSubtitles files, keyed by file id, so verify + shift + play
  // of one subtitle cost a single download against the daily quota.
  const osCache = new Map<string, { at: number; body: string }>();
  const OS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  // Only file ids this instance surfaced in a recent search may be downloaded,
  // so the public /os route cannot be used as a general OpenSubtitles proxy for
  // arbitrary ids on our key. Plus a hard daily cap on actual downloads, so the
  // paid quota cannot be drained even within the vouched set.
  const vouchedFiles = new Map<string, number>(); // file id -> expiry (ms)
  const VOUCH_TTL_MS = 60 * 60 * 1000;
  let osDownloads = { day: '', count: 0 };
  const downloadBudgetLeft = (): boolean => {
    const today = new Date().toISOString().slice(0, 10);
    if (osDownloads.day !== today) osDownloads = { day: today, count: 0 };
    return osDownloads.count < base.osDownloadBudget;
  };
  // SubDL — the anime-correct source — mirrors the OpenSubtitles proxy: its
  // zip downloads are quota-limited, so same vouch + daily cap + cache.
  const subdlCache = new Map<string, { at: number; body: string }>();
  const subdlVouched = new Map<string, number>();
  let subdlDownloads = { day: '', count: 0 };
  const subdlBudgetLeft = (): boolean => {
    const today = new Date().toISOString().slice(0, 10);
    if (subdlDownloads.day !== today) subdlDownloads = { day: today, count: 0 };
    return subdlDownloads.count < base.subdlDownloadBudget;
  };

  const send = (res: ServerResponse, status: number, body: string, type = 'application/json') => {
    res.writeHead(status, {
      'Content-Type': `${type}; charset=utf-8`,
      'Access-Control-Allow-Origin': '*',
      // Never let an error be cached publicly: a transient upstream failure
      // would otherwise poison shared caches for every viewer.
      'Cache-Control': status >= 400 ? 'no-store' : 'public, max-age=300',
    });
    res.end(body);
  };

  // Keep the in-memory maps from growing without bound (a request with a novel
  // hash adds entries): evict the oldest once over cap. Maps iterate in
  // insertion order, so the first key is the oldest.
  const capMap = <V>(m: Map<string, V>, max: number) => {
    while (m.size > max) {
      const oldest = m.keys().next().value;
      if (oldest === undefined) break;
      m.delete(oldest);
    }
  };
  const MAX_OS_ENTRIES = 500;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/health') return send(res, 200, JSON.stringify({ ok: true }));

    // Browsers ask for this unprompted on every page load, so without a route
    // the configure page logs a 404 against itself.
    if (pathname === '/logo.svg' || pathname === '/favicon.ico') {
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=604800',
      });
      res.end(logoSvg());
      return;
    }

    if (deps.watchOrder?.handleImage(req, res, pathname)) return;

    // OpenSubtitles download proxy. The search result points here so a download
    // is spent only on fetch (verification or playback), and the cache collapses
    // the verify + shift + play hits on one file to a single real download.
    const os = pathname.match(/^\/os\/(\d+)\.srt$/);
    if (os) {
      const apiKey = base.opensubtitlesApiKey;
      const fileId = os[1]!;
      if (!apiKey) return send(res, 404, JSON.stringify({ err: 'not found' }));
      const cached = osCache.get(fileId);
      let body: string;
      if (cached && Date.now() - cached.at < OS_CACHE_TTL_MS) {
        body = cached.body;
      } else {
        // Refuse ids this instance never surfaced: the route is public and
        // spends a paid quota, so it serves only our own search results.
        const vouch = vouchedFiles.get(fileId);
        if (!vouch || vouch < Date.now()) return send(res, 404, JSON.stringify({ err: 'not found' }));
        if (!downloadBudgetLeft()) return send(res, 429, JSON.stringify({ err: 'daily download budget reached' }));
        // Reserve the budget slot BEFORE the await, or concurrent requests all
        // pass the check and blow past the cap; release it if the download fails.
        osDownloads.count += 1;
        try {
          body = await downloadFile({ apiKey, fileId });
          osCache.set(fileId, { at: Date.now(), body });
          capMap(osCache, MAX_OS_ENTRIES);
        } catch {
          osDownloads.count -= 1;
          return send(res, 502, JSON.stringify({ err: 'opensubtitles download failed' }));
        }
      }
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(body);
      return;
    }

    // SubDL download proxy — same gating as /os (vouched ids + daily cap).
    const sd = pathname.match(/^\/subdl\/([\w-]+)\.srt$/);
    if (sd) {
      const apiKey = base.subdlApiKey;
      const zipId = sd[1]!;
      if (!apiKey) return send(res, 404, JSON.stringify({ err: 'not found' }));
      const cached = subdlCache.get(zipId);
      let body: string;
      if (cached && Date.now() - cached.at < OS_CACHE_TTL_MS) {
        body = cached.body;
      } else {
        const vouch = subdlVouched.get(zipId);
        if (!vouch || vouch < Date.now()) return send(res, 404, JSON.stringify({ err: 'not found' }));
        if (!subdlBudgetLeft()) return send(res, 429, JSON.stringify({ err: 'daily download budget reached' }));
        subdlDownloads.count += 1;
        try {
          body = await downloadSubdl({ apiKey, zipId });
          subdlCache.set(zipId, { at: Date.now(), body });
          capMap(subdlCache, MAX_OS_ENTRIES);
        } catch {
          subdlDownloads.count -= 1;
          return send(res, 502, JSON.stringify({ err: 'subdl download failed' }));
        }
      }
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(body);
      return;
    }

    // Checked before route parsing: a shift path carries base64 segments of
    // its own, which must not be mistaken for a config segment.
    const shift = parseShiftPath(pathname);
    if (shift) {
      const body = await fetchShifted(shift);
      if (body === null) return send(res, 502, JSON.stringify({ err: 'upstream failed' }));
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(body);
      return;
    }

    const route = parseRoute(pathname);
    const config = route.config ? applyUrlConfig(base, route.config) : base;
    const watchOrder = config.watchOrder && route.rank === null ? deps.watchOrder : undefined;

    if (watchOrder?.handle(req, res, route.rest)) return;

    if (route.rest === '/' || route.rest === '/configure' || route.rest === '/configure/') {
      return send(res, 200, configurePage(base), 'text/html');
    }

    if (route.rest === '/manifest.json') {
      return send(
        res,
        200,
        JSON.stringify(
          buildManifest({ name: config.addonName, rank: route.rank, publicUrl: config.publicUrl, watchOrder: !!watchOrder }),
        ),
      );
    }

    const parsed = parseSubtitlePath(route.rest);
    if (!parsed) return send(res, 404, JSON.stringify({ err: 'not found' }));

    // Keyed on every setting that changes the output, so two users with
    // different configs cannot be served each other's results.
    const key = `${cacheFingerprint(config)}|${route.rank ?? 'all'}|${route.rest}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < config.cacheTtl * 1000) return send(res, 200, hit.body);

    try {
      const merged = await fetchForRequest(config.upstreamBases, route.rest);
      let subs = merged.subtitles;

      // Hash-first exact match: when we have the file's moviehash and a key,
      // ask the official API for the subtitle cut for this exact file. These
      // carry moviehash:true, so HASH_WEIGHT floats them above every id-only
      // result from the keyless upstream.
      if (config.opensubtitlesApiKey && parsed.extras.videoHash && config.publicUrl) {
        const hashSubs = await searchByHash({
          apiKey: config.opensubtitlesApiKey,
          hash: parsed.extras.videoHash,
          langs: config.langPref,
          proxyBase: config.publicUrl,
        });
        // Vouch these file ids so their /os downloads are permitted.
        const now = Date.now();
        for (const s of hashSubs) {
          const m = s.url.match(/\/os\/(\d+)\.srt$/);
          if (m) vouchedFiles.set(m[1]!, now + VOUCH_TTL_MS);
        }
        capMap(vouchedFiles, MAX_OS_ENTRIES);
        subs = [...hashSubs, ...subs];
      }

      if (config.probeLabels) {
        return send(res, 200, JSON.stringify({ subtitles: buildProbeSubtitles(subs[0]) }));
      }

      // Resolve the requested episode's authoritative identity. Prefer the
      // IMDb id the upstream query resolved to (a Kitsu id is mapped there),
      // falling back to the id as requested.
      let sid = parseSeriesId(parsed.id);
      if (!sid && merged.resolvedPath) {
        const rm = /^\/subtitles\/[^/]+\/([^/]+?)(?:\/.+)?\.json$/.exec(merged.resolvedPath);
        if (rm) sid = parseSeriesId(decodeURIComponent(rm[1]!));
      }

      // SubDL carries the correct arc release name ("Swordsmith Village Arc
      // Ep04") where OpenSubtitles' IMDb-season bucket is polluted with the
      // wrong arc, so add it to the pool for the right episode to win.
      if (config.subdlApiKey && config.publicUrl && sid) {
        const sdSubs = await searchSubdl({
          apiKey: config.subdlApiKey,
          imdbId: sid.imdbId,
          season: sid.season,
          episode: sid.episode,
          langs: config.langPref,
          proxyBase: config.publicUrl,
        });
        const now = Date.now();
        for (const s of sdSubs) {
          const m = s.url.match(/\/subdl\/([\w-]+)\.srt$/);
          if (m) subdlVouched.set(m[1]!, now + VOUCH_TTL_MS);
        }
        capMap(subdlVouched, MAX_OS_ENTRIES);
        subs = [...sdSubs, ...subs];
      }

      let identity: RequestIdentity = {};
      if (sid) {
        const episodeTitle = await episodeTitleFor(sid.imdbId, sid.season, sid.episode);
        const arc = arcKeywords(sid.imdbId, sid.season);
        const foreign = foreignArcKeywords(sid.imdbId, sid.season);
        identity = {
          season: sid.season,
          episode: sid.episode,
          ...(episodeTitle !== undefined ? { episodeTitle } : {}),
          ...(arc.length > 0 ? { arcKeywords: arc } : {}),
          ...(foreign.length > 0 ? { foreignArcKeywords: foreign } : {}),
        };

        // We can anchor the correct arc when we know this episode's title or its
        // arc keywords. If we can but nothing in this season's own results
        // carries either, the correct arc is almost certainly filed under a
        // neighbouring season number — anime arcs drift by a season between the
        // IMDb/Cinemeta and Crunchyroll numberings. Fetch the adjacent seasons'
        // same episode so the anchor is in the pool; the pipeline then pins the
        // correct arc, drops subtitles that name a different arc, and lets the
        // timeline place the rest.
        const canAnchor = episodeTitle !== undefined || arc.length > 0;
        const haveAnchor =
          hasTitleBearingSub(subs, episodeTitle) || hasArcBearingSub(subs, arc);
        if (canAnchor && !haveAnchor) {
          const neighbours = [sid.season - 1, sid.season + 1].filter((s) => s >= 1);
          const extra = await Promise.all(
            neighbours.map((s) =>
              fetchForRequest(config.upstreamBases, withSeason(route.rest, sid!.imdbId, sid!.season, s, sid!.episode)),
            ),
          );
          const seen = new Set(subs.map((s) => s.url));
          for (const r of extra) {
            for (const s of r.subtitles) {
              if (!seen.has(s.url)) {
                seen.add(s.url);
                subs.push(s);
              }
            }
          }
        }
      }

      const result = await runPipeline(subs, parsed.extras, config, identity);

      // A rank-pinned instance returns exactly its own position, so that
      // installing several gives one named row each.
      const subtitles =
        route.rank === null
          ? result.subtitles
          : result.subtitles.slice(route.rank - 1, route.rank);

      const body = JSON.stringify({ subtitles });

      console.log(
        JSON.stringify({
          path: route.rest,
          resolvedPath: merged.resolvedPath,
          rank: route.rank,
          urlConfig: route.config !== null,
          hasFilename: Boolean(parsed.extras.filename),
          upstreamsOk: merged.ok.length,
          upstreamsFailed: merged.failed,
          received: result.stats.received,
          returned: subtitles.length,
          verified: result.stats.verified,
          targetGroup: result.stats.target.group ?? null,
        }),
      );

      if (cache.size >= MAX_CACHE_ENTRIES) {
        // Map iterates in insertion order, so the first key is the oldest.
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(key, { at: Date.now(), body });
      return send(res, 200, body);
    } catch (err) {
      console.error('subtitle request failed', err);
      return send(res, 200, JSON.stringify({ subtitles: [] }));
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  let watchOrder: WatchOrderStore | undefined;
  if (config.watchOrder) {
    if (!config.publicUrl) {
      console.error('[watch-order] disabled: PUBLIC_URL is required, thumbnails need absolute URLs');
    } else {
      watchOrder = new WatchOrderStore(config.watchOrderDir);
      watchOrder.start();
      if (config.watchOrderBuilder === 'internal') {
        startScheduler({ dir: config.watchOrderDir, hour: config.watchOrderHour, publicUrl: config.publicUrl, store: watchOrder });
      }
    }
  }
  createServer(createApp(config, watchOrder ? { watchOrder } : {})).listen(config.port, config.host, () => {
    console.log(`subranker listening on ${config.host}:${config.port}`);
  });
}

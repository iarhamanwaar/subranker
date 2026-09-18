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
import { buildProbeSubtitles } from './label/probe.js';
import { runPipeline } from './pipeline.js';
import { fetchShifted, parseShiftPath } from './shift/route.js';
import { fetchUpstreams } from './upstream/fetch.js';
import type { RequestExtras } from './types.js';

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

export function createApp(base: Config) {
  const cache = new Map<string, CacheEntry>();

  const send = (res: ServerResponse, status: number, body: string, type = 'application/json') => {
    res.writeHead(status, {
      'Content-Type': `${type}; charset=utf-8`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    });
    res.end(body);
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/health') return send(res, 200, JSON.stringify({ ok: true }));

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

    if (route.rest === '/' || route.rest === '/configure' || route.rest === '/configure/') {
      return send(res, 200, configurePage(base), 'text/html');
    }

    if (route.rest === '/manifest.json') {
      return send(
        res,
        200,
        JSON.stringify(buildManifest({ name: config.addonName, rank: route.rank })),
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
      const merged = await fetchUpstreams(config.upstreamBases, route.rest);
      const subs = merged.subtitles;

      if (config.probeLabels) {
        return send(res, 200, JSON.stringify({ subtitles: buildProbeSubtitles(subs[0]) }));
      }

      const result = await runPipeline(subs, parsed.extras, config);

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
  createServer(createApp(config)).listen(config.port, '127.0.0.1', () => {
    console.log(`subranker listening on 127.0.0.1:${config.port}`);
  });
}

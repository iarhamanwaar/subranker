/**
 * HTTP entry point.
 *
 * Only the `/subtitles/` route is rewritten. Everything else is proxied through
 * untouched, so installing this in place of an existing addon changes subtitle
 * ordering and nothing else.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig, type Config } from './config.js';
import { runPipeline } from './pipeline.js';
import { buildProbeSubtitles } from './label/probe.js';
import type { RawSubtitle, RequestExtras } from './types.js';

/**
 * Parse Stremio's extras segment.
 *
 * Stremio appends extras between the id and `.json`, e.g.
 * `/subtitles/series/tt9335498:1:1/videoHash=…&videoSize=…&filename=….json`.
 * Several clients — the Android TV client among them — omit the segment
 * entirely, so every field is optional and the pipeline degrades to metadata
 * ranking when they are missing.
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

export function createApp(config: Config) {
  const cache = new Map<string, CacheEntry>();

  const send = (res: ServerResponse, status: number, body: string) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    });
    res.end(body);
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/health') {
      return send(res, 200, JSON.stringify({ ok: true }));
    }

    if (pathname.endsWith('/manifest.json')) {
      const upstream = await fetch(`${config.upstreamBase}/manifest.json`);
      const manifest = (await upstream.json()) as Record<string, unknown>;
      return send(
        res,
        200,
        JSON.stringify({
          // Deliberately NOT spread from the upstream manifest. Doing so leaks
          // upstream identifiers (an AIOStreams id embeds the user's config
          // UUID) onto a publicly reachable endpoint, and it would advertise
          // stream/catalog/meta resources this addon must not serve.
          id: 'com.subranker',
          version: '0.1.0',
          name: config.addonName,
          description:
            'Ranks, verifies and relabels subtitles so the best match for the ' +
            'release you are playing is first.',
          resources: ['subtitles'],
          types: Array.isArray(manifest.types) ? manifest.types : ['movie', 'series'],
          idPrefixes: Array.isArray(manifest.idPrefixes) ? manifest.idPrefixes : ['tt', 'kitsu'],
          catalogs: [],
        }),
      );
    }

    const parsed = parseSubtitlePath(pathname);
    if (!parsed) {
      // Subtitles only. Proxying other routes would re-serve the upstream's
      // stream results — which are backed by the operator's paid debrid
      // account — to anyone who found this host.
      return send(res, 404, JSON.stringify({ err: 'not found' }));
    }

    const key = pathname;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < config.cacheTtl * 1000) {
      return send(res, 200, hit.body);
    }

    try {
      const upstreamUrl = `${config.upstreamBase}${pathname}`;
      const upstream = await fetch(upstreamUrl);
      const payload = (await upstream.json()) as { subtitles?: RawSubtitle[] };
      const subs = Array.isArray(payload.subtitles) ? payload.subtitles : [];

      if (config.probeLabels) {
        // Diagnostic: return one row per candidate label format instead of
        // real results, to find out what this client will render.
        return send(res, 200, JSON.stringify({ subtitles: buildProbeSubtitles(subs[0]) }));
      }

      const result = await runPipeline(subs, parsed.extras, config);
      const body = JSON.stringify({ subtitles: result.subtitles });

      console.log(
        JSON.stringify({
          path: pathname,
          extras: parsed.extras,
          hasFilename: Boolean(parsed.extras.filename),
          ...result.stats,
          target: undefined,
          targetGroup: result.stats.target.group ?? null,
        }),
      );

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

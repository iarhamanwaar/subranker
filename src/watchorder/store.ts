/**
 * Serves what the builder produced, from memory.
 *
 * Responses are encoded once when a build lands (JSON, gzip and brotli, with
 * an ETag), so a request costs a map lookup and a write: no disk, no JSON
 * work, no compression on the request path. Images are served from disk with
 * immutable caching, because their names are hashes of their content.
 */
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BuiltIndex } from './build.js';

interface Encoded {
  etag: string;
  raw: Buffer;
  gzip: Buffer;
  br: Buffer;
}

/** Playlists change at most nightly; clients may reuse a copy for an hour. */
const JSON_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';
const IMAGE_CACHE = 'public, max-age=31536000, immutable';
const IMAGE_NAME = /^[a-f0-9]{20}\.(jpg|png)$/;
/** How often to look for a new build. A stat per minute is free. */
const POLL_MS = 60_000;

function encode(value: unknown): Encoded {
  const raw = Buffer.from(JSON.stringify(value));
  return {
    etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 22)}"`,
    raw,
    gzip: gzipSync(raw, { level: 9 }),
    br: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
  };
}

export class WatchOrderStore {
  private catalog: Encoded | null = null;
  private metas = new Map<string, Encoded>();
  private loadedMtime = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly dir: string) {}

  /** Load the current build, then keep watching for newer ones. */
  start(): void {
    this.reload();
    this.timer = setInterval(() => this.reload(), POLL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get ready(): boolean {
    return this.catalog !== null;
  }

  /** Picks up a finished build. Returns whether anything changed. */
  reload(): boolean {
    const file = join(this.dir, 'index.json');
    let mtime: number;
    try {
      mtime = statSync(file).mtimeMs;
    } catch {
      return false; // nothing built yet
    }
    if (mtime === this.loadedMtime) return false;
    try {
      const index = JSON.parse(readFileSync(file, 'utf8')) as BuiltIndex;
      // Encode everything before swapping, so no request sees half a build.
      const catalog = encode({ metas: index.catalog });
      const metas = new Map(Object.entries(index.metas).map(([id, meta]) => [id, encode({ meta })]));
      this.catalog = catalog;
      this.metas = metas;
      this.loadedMtime = mtime;
      console.log(`[watch-order] serving build from ${index.builtAt}: ${metas.size} playlists`);
      return true;
    } catch (err) {
      // The builder writes atomically, so this is a corrupt file, not a race.
      // Keep serving the previous build.
      console.error('[watch-order] could not load build:', err);
      return false;
    }
  }

  /**
   * Answer a Watch Order request, or return false if the path is not ours.
   * `rest` is the path after any config segment.
   */
  handle(req: IncomingMessage, res: ServerResponse, rest: string): boolean {
    if (rest.startsWith('/catalog/series/watchorder')) {
      // Extras (search, skip) are not supported: the row is a handful of cards.
      if (!/^\/catalog\/series\/watchorder(\/[^/]*)?\.json$/.test(rest)) return false;
      this.sendJson(req, res, this.catalog ?? encode({ metas: [] }));
      return true;
    }
    const meta = /^\/meta\/series\/(wo-[a-z0-9-]+)\.json$/.exec(rest);
    if (meta) {
      const hit = this.metas.get(meta[1]!);
      if (!hit) {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end('{"err":"not found"}');
      } else {
        this.sendJson(req, res, hit);
      }
      return true;
    }
    return false;
  }

  /** Images live outside any config prefix: their URLs are baked into the metas. */
  handleImage(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
    if (!pathname.startsWith('/wo/img/')) return false;
    const name = pathname.slice('/wo/img/'.length);
    if (!IMAGE_NAME.test(name)) {
      res.writeHead(404);
      res.end();
      return true;
    }
    const file = join(this.dir, 'img', name);
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      res.writeHead(404);
      res.end();
      return true;
    }
    // The name is the content hash, so the name is a perfect validator.
    const etag = `"${name.slice(0, 20)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': IMAGE_CACHE });
      res.end();
      return true;
    }
    res.writeHead(200, {
      'Content-Type': name.endsWith('.png') ? 'image/png' : 'image/jpeg',
      'Content-Length': size,
      'Cache-Control': IMAGE_CACHE,
      ETag: etag,
      'Access-Control-Allow-Origin': '*',
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
    return true;
  }

  private sendJson(req: IncomingMessage, res: ServerResponse, body: Encoded): void {
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': JSON_CACHE,
      ETag: body.etag,
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === body.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const accept = String(req.headers['accept-encoding'] ?? '');
    const [enc, buf] = /\bbr\b/.test(accept) ? ['br', body.br] : /\bgzip\b/.test(accept) ? ['gzip', body.gzip] : [null, body.raw];
    if (enc) headers['Content-Encoding'] = enc;
    headers['Content-Length'] = buf.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : buf);
  }
}

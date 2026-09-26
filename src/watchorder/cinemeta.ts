/**
 * Cinemeta client for the playlist builder.
 *
 * Cinemeta rate-limits and sometimes answers with an HTML error page, so each
 * call retries, and a stale cached copy is used rather than failing a whole
 * rebuild because one title would not load.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MetaGetter } from './playlist.js';
import type { SourceMeta } from './types.js';

const BASE = 'https://v3-cinemeta.strem.io';
/** Shorter than the rebuild interval, so each nightly run sees fresh data. */
const TTL_MS = 6 * 3600 * 1000;

export function cinemetaClient(cacheDir: string): MetaGetter {
  mkdirSync(cacheDir, { recursive: true });
  return async (type, id) => {
    const file = join(cacheDir, `${type}-${id.replace(/[^\w.-]/g, '_')}.json`);
    try {
      if (Date.now() - statSync(file).mtimeMs < TTL_MS) return JSON.parse(readFileSync(file, 'utf8')) as SourceMeta;
    } catch {
      // no cached copy yet
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await fetch(`${BASE}/meta/${type}/${id}.json`, { signal: AbortSignal.timeout(20_000) });
        const meta = (JSON.parse(await res.text()) as { meta?: SourceMeta }).meta;
        if (meta) {
          writeFileSync(file, JSON.stringify(meta));
          return meta;
        }
      } catch {
        // retried below
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as SourceMeta;
    } catch {
      throw new Error(`cinemeta ${type}/${id} unavailable`);
    }
  };
}

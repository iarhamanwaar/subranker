/**
 * OpenSubtitles official REST API adapter — hash-first exact matching.
 *
 * Distinct from the `opensubtitles-v3.strem.io` upstream (a keyless Stremio
 * addon that searches only by imdb-id). This talks to api.opensubtitles.com
 * with an API key: search by `moviehash` is unlimited and returns the subtitle
 * cut for the exact file being played, which the id-only upstream cannot find.
 *
 * Downloads are the scarce resource (100/day on the dev tier), so the search
 * result's URL points at SubRanker's own `/os/<fileId>.srt` proxy; a download
 * is spent only when that URL is actually fetched (verification or playback),
 * and the proxy caches by file id so repeated hits cost one download.
 */
import type { RawSubtitle } from '../types.js';

const API = 'https://api.opensubtitles.com/api/v1';
const UA = 'SubRanker v0.2.0';

interface OsFile {
  file_id?: number;
  file_name?: string;
}
interface OsAttributes {
  language?: string;
  release?: string;
  moviehash_match?: boolean;
  files?: OsFile[];
}
interface OsSearchResponse {
  data?: Array<{ attributes?: OsAttributes }>;
}

type FetchImpl = typeof fetch;

/** Convert an OpenSubtitles search response into RawSubtitles via the proxy. */
export function toRawSubtitles(resp: OsSearchResponse, proxyBase: string): RawSubtitle[] {
  const base = proxyBase.replace(/\/+$/, '');
  const out: RawSubtitle[] = [];
  for (const item of resp.data ?? []) {
    const a = item.attributes ?? {};
    const file = (a.files ?? [])[0];
    if (!file?.file_id) continue; // nothing downloadable
    out.push({
      id: `opensubtitles-api:${file.file_id}`,
      url: `${base}/os/${file.file_id}.srt`,
      lang: a.language ?? 'en',
      ...(a.release ? { releaseName: a.release } : {}),
      ...(file.file_name ? { fileName: file.file_name } : {}),
      // Only a real hash match is the exact file; mark it so HASH_WEIGHT wins.
      ...(a.moviehash_match === true ? { moviehash: true } : {}),
      upstream: 'opensubtitles-api',
    });
  }
  return out;
}

/** Build a canonically-ordered query string (OpenSubtitles 301s otherwise). */
function query(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k]!)}`)
    .join('&');
}

/** Search by moviehash (quota-free). Returns [] without a hash or on failure. */
export async function searchByHash(opts: {
  apiKey: string;
  hash: string | undefined;
  langs: string[];
  proxyBase: string;
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
}): Promise<RawSubtitle[]> {
  if (!opts.hash) return [];
  const doFetch = opts.fetchImpl ?? fetch;
  // The API uses 2-letter codes; map our accepted set down to 'en'.
  const lang = opts.langs.some((l) => l === 'en' || l === 'eng' || l === 'english') ? 'en' : (opts.langs[0] ?? 'en');
  const url = `${API}/subtitles?${query({ moviehash: opts.hash, languages: lang })}`;
  try {
    const res = await doFetch(url, {
      headers: { 'Api-Key': opts.apiKey, 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OsSearchResponse;
    return toRawSubtitles(data, opts.proxyBase);
  } catch {
    return [];
  }
}

/** Resolve a file id to its subtitle text (spends one download from the quota). */
export async function downloadFile(opts: {
  apiKey: string;
  fileId: string;
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
}): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${API}/download`, {
    method: 'POST',
    headers: {
      'Api-Key': opts.apiKey,
      'User-Agent': UA,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ file_id: Number(opts.fileId) }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
  });
  if (!res.ok) throw new Error(`OpenSubtitles download HTTP ${res.status}`);
  const { link } = (await res.json()) as { link?: string };
  if (!link) throw new Error('OpenSubtitles download: no link');
  const file = await doFetch(link, { signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
  if (!file.ok) throw new Error(`OpenSubtitles file HTTP ${file.status}`);
  return file.text();
}

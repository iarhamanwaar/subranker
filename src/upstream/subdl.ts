/**
 * SubDL adapter — the anime-correct subtitle source.
 *
 * OpenSubtitles files anime by IMDb season, which collides with the way
 * fansubbers number arcs (Swordsmith Village is "S3" to them, "S4" to IMDb),
 * so its S4 bucket is polluted with the wrong arc. SubDL keeps the distinctive
 * arc release name ("Swordsmith Village Arc Ep04"), so the correct episode is
 * present and identifiable — verified to match the video where OpenSubtitles
 * does not.
 *
 * SubDL serves subtitles as ZIP files with the API key in the URL, so we fetch
 * and extract server-side (key never reaches the client) and expose the result
 * through SubRanker's own `/subdl/<id>.srt` proxy, same as the OpenSubtitles one.
 */
import { strFromU8, unzipSync } from 'fflate';
import type { RawSubtitle } from '../types.js';

const API = 'https://api.subdl.com/api/v1/subtitles';
const DL = 'https://dl.subdl.com';

type FetchImpl = typeof fetch;

interface SubdlEntry {
  release_name?: string;
  name?: string;
  language?: string;
  lang?: string;
  url?: string;
}
interface SubdlResponse {
  status?: boolean;
  subtitles?: SubdlEntry[];
}

/** The `3071076-3080524` id from a SubDL `/subtitle/<id>.zip?...` url. */
export function zipIdFromUrl(url: string): string | null {
  const m = url.match(/\/subtitle\/([\w-]+)\.zip/);
  return m ? m[1]! : null;
}

// Dub / closed-caption entries: the user wants original audio with subs, and
// these also tend to carry spam in the release name.
const DUB_RE = /\b(dub|dubbed|cc\/sdh|caption)\b/i;

export function toRawSubtitles(resp: SubdlResponse, proxyBase: string): RawSubtitle[] {
  const base = proxyBase.replace(/\/+$/, '');
  const out: RawSubtitle[] = [];
  for (const s of resp.subtitles ?? []) {
    const release = s.release_name ?? s.name ?? '';
    if (DUB_RE.test(release)) continue;
    if (!s.url) continue;
    const id = zipIdFromUrl(s.url);
    if (!id) continue;
    const raw = (s.language ?? s.lang ?? 'en').toLowerCase();
    out.push({
      id: `subdl:${id}`,
      url: `${base}/subdl/${id}.srt`,
      lang: raw === 'en' || raw === 'english' ? 'eng' : raw,
      ...(release ? { releaseName: release } : {}),
      upstream: 'subdl',
    });
  }
  return out;
}

/** Largest subtitle we will decompress/serve (a real one is tens of KB). */
const MAX_SUB_BYTES = 2_000_000;

/**
 * Extract the first subtitle from a SubDL zip. The zip is untrusted, so only
 * subtitle files whose declared uncompressed size is bounded are decompressed
 * — a zip bomb never gets inflated.
 */
export function extractSrt(zip: Uint8Array): string {
  const files = unzipSync(zip, {
    filter: (f) => /\.(srt|ass|vtt)$/i.test(f.name) && f.originalSize <= MAX_SUB_BYTES,
  });
  const name = Object.keys(files).find((n) => /\.(srt|ass|vtt)$/i.test(n));
  if (!name) throw new Error('SubDL zip has no subtitle file within size limit');
  return strFromU8(files[name]!);
}

/** Search SubDL by IMDb id + season/episode. Returns [] on failure. */
export async function searchSubdl(opts: {
  apiKey: string;
  imdbId: string;
  season: number;
  episode: number;
  langs: string[];
  proxyBase: string;
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
}): Promise<RawSubtitle[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const lang = opts.langs.some((l) => l === 'en' || l === 'eng' || l === 'english') ? 'EN' : (opts.langs[0] ?? 'EN').toUpperCase();
  const url =
    `${API}?api_key=${encodeURIComponent(opts.apiKey)}&imdb_id=${encodeURIComponent(opts.imdbId)}` +
    `&season_number=${opts.season}&episode_number=${opts.episode}&languages=${lang}&type=tv`;
  try {
    const res = await doFetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as SubdlResponse;
    return toRawSubtitles(data, opts.proxyBase);
  } catch {
    return [];
  }
}

/** Download a SubDL zip by id and return the extracted subtitle text. */
export async function downloadSubdl(opts: {
  apiKey: string;
  zipId: string;
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
}): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${DL}/subtitle/${opts.zipId}.zip?api_key=${encodeURIComponent(opts.apiKey)}`;
  const res = await doFetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  if (!res.ok) throw new Error(`SubDL download HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // A subtitle zip is tiny; refuse an oversized download before decompressing.
  if (buf.byteLength > 10_000_000) throw new Error('SubDL zip too large');
  return extractSrt(buf);
}

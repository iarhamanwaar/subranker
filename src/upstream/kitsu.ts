/**
 * Kitsu → IMDb id resolution.
 *
 * Anime catalogs (the Kitsu addon, AIOMetadata in anime mode) hand Stremio ids
 * like `kitsu:41370:18`. Most subtitle addons only index IMDb ids, so passing
 * the Kitsu id through verbatim is not an error — it silently returns almost
 * nothing. Measured on Demon Slayer S01E18: SubSense returned 0 for
 * `kitsu:41370:18` and 14 for `tt9335498:1:18`, leaving one or two
 * unverifiable files where there should have been a consensus to align to.
 *
 * The Kitsu addon's meta already carries the mapping per episode
 * (`imdb_id`, `imdbSeason`, `imdbEpisode`), including the awkward cases where
 * one Kitsu entry is a later IMDb season or episodes are numbered absolutely.
 */

const META_BASE = process.env.KITSU_META_BASE ?? 'https://anime-kitsu.strem.fun';
const TIMEOUT_MS = 4000;
/** Mappings change only when a new season airs; a day is plenty. */
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

interface KitsuVideo {
  id?: string;
  imdb_id?: string;
  imdbSeason?: number;
  imdbEpisode?: number;
}

/** Kitsu series id → (Kitsu video id → IMDb stremio id). */
const cache = new Map<string, { at: number; map: Map<string, string> }>();

async function loadSeries(seriesId: string): Promise<Map<string, string> | null> {
  const hit = cache.get(seriesId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.map;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${META_BASE}/meta/series/kitsu:${seriesId}.json`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { meta?: { imdb_id?: string; videos?: KitsuVideo[] } };
    const meta = payload.meta;
    if (!meta) return null;

    const map = new Map<string, string>();
    const seriesImdb = meta.imdb_id;
    for (const v of meta.videos ?? []) {
      const imdb = v.imdb_id ?? seriesImdb;
      if (!v.id || !imdb?.startsWith('tt')) continue;
      map.set(
        v.id,
        v.imdbSeason && v.imdbEpisode ? `${imdb}:${v.imdbSeason}:${v.imdbEpisode}` : imdb,
      );
    }
    // A movie entry has no videos; its IMDb id stands for the whole thing.
    if (map.size === 0 && seriesImdb?.startsWith('tt')) map.set(`kitsu:${seriesId}`, seriesImdb);

    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(seriesId, { at: Date.now(), map });
    return map;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** `kitsu:41370:18` → `tt9335498:1:18`, or null when there is no mapping. */
export async function kitsuToImdb(id: string): Promise<string | null> {
  const m = /^kitsu:(\d+)(?::(\d+))?$/.exec(id);
  if (!m) return null;
  const map = await loadSeries(m[1]!);
  if (!map) return null;
  return map.get(id) ?? (m[2] === undefined ? map.get(`kitsu:${m[1]}`) ?? null : null);
}

/**
 * The IMDb form of a subtitle path, keeping the type and extras segment.
 * Returns null for non-Kitsu paths or when the id cannot be resolved.
 */
export async function imdbPathFor(path: string): Promise<string | null> {
  const m = /^\/subtitles\/([^/]+)\/(kitsu(?::|%3A)[^/]+?)(\/.+)?\.json$/.exec(path);
  if (!m) return null;
  const imdb = await kitsuToImdb(decodeURIComponent(m[2]!));
  if (!imdb) return null;
  // An episode maps to a series episode; a Kitsu movie can map to an IMDb movie.
  const type = imdb.includes(':') ? 'series' : m[1]!;
  return `/subtitles/${type}/${imdb}${m[3] ?? ''}.json`;
}

/** Test hook. */
export function clearKitsuCache(): void {
  cache.clear();
}

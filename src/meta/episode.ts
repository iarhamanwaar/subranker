/**
 * Authoritative episode identity, from Cinemeta.
 *
 * A subtitle request carries a Stremio id like `tt9335498:3:1`, but the
 * upstream indexes by that same id and some anime arcs are filed under more
 * than one season convention (Crunchyroll folds Mugen Train and Entertainment
 * District into "Season 2", so its "Season 3" is Swordsmith Village, whereas
 * IMDb/Cinemeta number Entertainment District as Season 3). OpenSubtitles then
 * returns both arcs under one `S03E01`, and ranking on the id alone cannot tell
 * them apart — the wrong arc usually outnumbers the right one.
 *
 * The requested episode's *title* is convention-independent: `tt9335498:3:1` is
 * "Sound Hashira Tengen Uzui" no matter how a release numbers it. Resolving it
 * here gives the pipeline a fixed point to anchor on, so a sub whose release
 * name carries that title is known to be the right episode regardless of the
 * season number stamped on it.
 */

const BASE = process.env.CINEMETA_BASE ?? 'https://v3-cinemeta.strem.io';
const TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 4000;
const MAX_ENTRIES = 500;

interface MetaVideo {
  season?: number;
  episode?: number;
  number?: number;
  name?: string;
  title?: string;
}

const cache = new Map<string, { at: number; videos: MetaVideo[] | null }>();

async function seriesVideos(imdbId: string): Promise<MetaVideo[] | null> {
  const hit = cache.get(imdbId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.videos;

  let videos: MetaVideo[] | null = null;
  try {
    const res = await fetch(`${BASE}/meta/series/${imdbId}.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const payload = (await res.json()) as { meta?: { videos?: MetaVideo[] } };
      videos = payload.meta?.videos ?? null;
    }
  } catch {
    // Cinemeta down or slow: fall through with null, the pipeline just loses
    // the identity anchor for this request and ranks as it did before.
  }

  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(imdbId, { at: Date.now(), videos });
  return videos;
}

/** `tt9335498`, 3, 1 → "Sound Hashira Tengen Uzui", or undefined. */
export async function episodeTitleFor(
  imdbId: string,
  season: number,
  episode: number,
): Promise<string | undefined> {
  const videos = await seriesVideos(imdbId);
  if (!videos) return undefined;
  const v = videos.find((x) => x.season === season && (x.episode ?? x.number) === episode);
  const title = v?.name ?? v?.title;
  return typeof title === 'string' && title.trim().length > 0 ? title.trim() : undefined;
}

/** A series id with an explicit season and episode, e.g. `tt9335498:3:1`. */
export function parseSeriesId(id: string): { imdbId: string; season: number; episode: number } | null {
  const m = /^(tt\d+):(\d+):(\d+)$/.exec(id);
  if (!m) return null;
  return { imdbId: m[1]!, season: Number(m[2]), episode: Number(m[3]) };
}

/** Test hook. */
export function clearEpisodeCache(): void {
  cache.clear();
}

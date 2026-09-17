/**
 * Release-name parsing.
 *
 * Content type cannot be inferred from the Stremio id: Demon Slayer arrives as
 * a plain IMDb id (`tt9335498`) yet ships fansub-style release names such as
 * `[Erai-raws] Kimetsu no Yaiba-01-1080p`. Routing on the id prefix would
 * silently misparse anime, so instead we run both parsers on every name and
 * keep whichever produced the more confident result.
 */
import type { ParsedRelease } from '../types.js';

/** Markers that a track carries sound descriptions / speaker labels. */
const SDH_PATTERNS = [
  /\bsdh\b/i,
  /\[cc\]/i,
  /\bclosed[\s._-]?caption/i,
  /\bhearing[\s._-]?impaired\b/i,
  /\bhi\b(?![a-z])/i,
];

/**
 * Markers that a track is timed to a dub rather than the original audio.
 *
 * Deliberately narrow: `dual audio` describes the *video* release and says
 * nothing about which audio the subtitle was written against, so it is not
 * treated as a dub marker.
 */
const DUB_PATTERNS = [
  /\bdub(bed|s)?\b/i,
  /\bdub\[sdh\]/i,
  /\b(kaidubs|funidub|dubbing)\b/i,
  /\benglish[\s._-]?dub\b/i,
];

const SOURCE_MAP: Array<[RegExp, string]> = [
  [/\b(blu[\s._-]?ray|bd(rip|mux)?|brrip|bdr)\b/i, 'bluray'],
  [/\b(web[\s._-]?dl|web[\s._-]?rip|webrip|webdl|web|nf|amzn|netflix|crunchyroll|cr)\b/i, 'web'],
  [/\b(hdtv|dsr|pdtv)\b/i, 'hdtv'],
  [/\b(dvd(rip)?|r5)\b/i, 'dvd'],
  [/\b(cam|ts|telesync|hdcam)\b/i, 'cam'],
];

const RESOLUTION_RE = /\b(2160p|1440p|1080p|720p|480p|4k|uhd)\b/i;

function detectSource(name: string): string | undefined {
  for (const [re, value] of SOURCE_MAP) if (re.test(name)) return value;
  return undefined;
}

function detectFlag(name: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(name));
}

function normaliseGroup(group: unknown): string | undefined {
  if (typeof group !== 'string') return undefined;
  const cleaned = group.trim().replace(/^\[|\]$/g, '').toLowerCase();
  return cleaned.length > 0 ? cleaned : undefined;
}

function countConfidence(p: Omit<ParsedRelease, 'confidence' | 'parser'>): number {
  let n = 0;
  if (p.title) n += 1;
  if (p.group) n += 2; // the single most discriminating field
  if (p.resolution) n += 1;
  if (p.source) n += 1;
  if (p.episode !== undefined) n += 1;
  if (p.season !== undefined) n += 1;
  if (p.year !== undefined) n += 1;
  if (p.videoCodec) n += 1;
  return n;
}

/**
 * Anime-oriented parse. Uses anitomy when available, and otherwise falls back
 * to the bracketed-group convention that fansub releases follow.
 */
export async function parseAnime(name: string): Promise<ParsedRelease> {
  let title: string | undefined;
  let group: string | undefined;
  let episode: number | undefined;
  let resolution: string | undefined;
  let videoCodec: string | undefined;

  try {
    const mod: any = await import('anitomy-ng');
    const parse = mod.parse ?? mod.default?.parse ?? mod.default;
    const r = typeof parse === 'function' ? await parse(name) : undefined;
    if (r) {
      title = r.anime_title ?? r.animeTitle ?? r.title;
      group = normaliseGroup(r.release_group ?? r.releaseGroup);
      const ep = r.episode_number ?? r.episodeNumber;
      episode = ep !== undefined ? Number(Array.isArray(ep) ? ep[0] : ep) : undefined;
      resolution = r.video_resolution ?? r.videoResolution;
      videoCodec = r.video_term ?? r.videoTerm;
    }
  } catch {
    // anitomy unavailable; the heuristic fallback below still handles the
    // overwhelmingly common `[Group] Title - 01 [1080p]` shape.
  }

  if (!group) {
    const m = /^\s*\[([^\]]+)\]/.exec(name);
    if (m) group = normaliseGroup(m[1]);
  }
  if (episode === undefined) {
    const m = /(?:^|[\s._-])(?:-\s*)?(\d{1,3})(?:v\d)?(?=[\s._[-]|$)/.exec(
      name.replace(/^\s*\[[^\]]+\]/, ''),
    );
    if (m?.[1]) episode = Number(m[1]);
  }
  if (!resolution) {
    const m = RESOLUTION_RE.exec(name);
    if (m?.[1]) resolution = m[1].toLowerCase();
  }

  const base = {
    title: title?.trim(),
    group,
    episode,
    resolution: resolution?.toLowerCase(),
    videoCodec,
    source: detectSource(name),
    sdh: detectFlag(name, SDH_PATTERNS),
    dub: detectFlag(name, DUB_PATTERNS),
  };
  return { ...base, parser: 'anime', confidence: countConfidence(base) };
}

/** Radarr/Sonarr-style parse, for movies and live-action television. */
export async function parseGeneral(name: string): Promise<ParsedRelease> {
  let title: string | undefined;
  let season: number | undefined;
  let episode: number | undefined;
  let year: number | undefined;
  let resolution: string | undefined;
  let group: string | undefined;
  let videoCodec: string | undefined;

  try {
    const mod: any = await import('@ctrl/video-filename-parser');
    const fn = mod.filenameParse ?? mod.default?.filenameParse;
    if (typeof fn === 'function') {
      // `isTv` is a hint, not a hard switch; try TV first and fall back.
      const r = fn(name, true) ?? fn(name);
      if (r) {
        title = r.title;
        year = r.year ? Number(r.year) : undefined;
        resolution = typeof r.resolution === 'string' ? r.resolution : undefined;
        group = normaliseGroup(r.group ?? r.releaseGroup);
        videoCodec = typeof r.videoCodec === 'string' ? r.videoCodec : undefined;
        if (Array.isArray(r.seasons) && r.seasons.length > 0) season = Number(r.seasons[0]);
        if (Array.isArray(r.episodeNumbers) && r.episodeNumbers.length > 0) {
          episode = Number(r.episodeNumbers[0]);
        }
      }
    }
  } catch {
    // fall through to the regex fallback
  }

  const se = /\bS(\d{1,2})[\s._-]?E(\d{1,3})\b/i.exec(name);
  if (se) {
    season ??= Number(se[1]);
    episode ??= Number(se[2]);
  }
  if (season === undefined) {
    const s = /\bS(\d{1,2})\b(?!\s*E)/i.exec(name);
    if (s?.[1]) season = Number(s[1]);
  }
  if (year === undefined) {
    const y = /\b(19\d{2}|20\d{2})\b/.exec(name);
    if (y?.[1]) year = Number(y[1]);
  }
  if (!resolution) {
    const m = RESOLUTION_RE.exec(name);
    if (m?.[1]) resolution = m[1].toLowerCase();
  }

  const base = {
    title: title?.trim(),
    season,
    episode,
    year,
    resolution: resolution?.toLowerCase(),
    group,
    videoCodec,
    source: detectSource(name),
    sdh: detectFlag(name, SDH_PATTERNS),
    dub: detectFlag(name, DUB_PATTERNS),
  };
  return { ...base, parser: 'general', confidence: countConfidence(base) };
}

/**
 * Parse a release name with both parsers and merge the results.
 *
 * The higher-confidence parse wins overall, but fields the winner missed are
 * filled from the loser, and the SDH/dub flags are OR-ed because either parser
 * spotting a marker is enough to act on it.
 */
export async function parseRelease(name: string): Promise<ParsedRelease> {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return { sdh: false, dub: false, parser: 'none', confidence: 0 };
  }

  const [anime, general] = await Promise.all([parseAnime(trimmed), parseGeneral(trimmed)]);
  const [winner, other] = anime.confidence >= general.confidence ? [anime, general] : [general, anime];

  return {
    ...winner,
    title: winner.title ?? other.title,
    season: winner.season ?? other.season,
    episode: winner.episode ?? other.episode,
    year: winner.year ?? other.year,
    resolution: winner.resolution ?? other.resolution,
    source: winner.source ?? other.source,
    group: winner.group ?? other.group,
    videoCodec: winner.videoCodec ?? other.videoCodec,
    sdh: winner.sdh || other.sdh,
    dub: winner.dub || other.dub,
  };
}

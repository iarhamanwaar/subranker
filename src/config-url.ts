/**
 * Configuration carried in the URL.
 *
 * Environment configuration ties an instance to one user. Stremio addons
 * conventionally encode settings into the install URL instead, which lets a
 * single deployment serve many people with different settings and lets a
 * configure page hand out a ready-made link.
 *
 * The encoded blob may contain upstream URLs that embed API keys, exactly as
 * AIOStreams' own config segment does. That is inherent to the pattern: the
 * URL *is* the credential, so it should be treated like one and never shared.
 */
import type { Config } from './config.js';
import { isFetchableUrl } from './net.js';

/** The subset of settings a user may carry in their install URL. */
export interface UrlConfig {
  upstreams: string[];
  maxResults?: number;
  autoShift?: boolean;
  removeHearingImpaired?: boolean;
  fixUppercase?: boolean;
  fixOcr?: boolean;
  fixOverlaps?: boolean;
  demoteForced?: boolean;
  dropMismatches?: boolean;
  verify?: boolean;
  relabel?: boolean;
  watchOrder?: boolean;
}

export function encodeUrlConfig(config: UrlConfig): string {
  return Buffer.from(JSON.stringify(config), 'utf8').toString('base64url');
}

/**
 * Decode a config segment.
 *
 * Returns null rather than throwing: a malformed segment is a bad request, not
 * a server fault, and the caller answers 404 the way any unknown path would.
 */
export function decodeUrlConfig(segment: string): UrlConfig | null {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const raw = parsed as Record<string, unknown>;
    const upstreams = Array.isArray(raw.upstreams)
      ? raw.upstreams
          .filter((u): u is string => typeof u === 'string')
          .map((u) => u.trim().replace(/\/manifest\.json$/, '').replace(/\/+$/, ''))
          // The server fetches these on the caller's behalf, so a config may
          // not name loopback, private or metadata addresses. Without this the
          // config segment is an open proxy into the host's own network.
          .filter((u) => isFetchableUrl(u))
      : [];
    if (upstreams.length === 0) return null;

    const bool = (v: unknown): boolean | undefined =>
      typeof v === 'boolean' ? v : undefined;
    const int = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined;

    return {
      upstreams,
      maxResults: int(raw.maxResults),
      autoShift: bool(raw.autoShift),
      removeHearingImpaired: bool(raw.removeHearingImpaired),
      fixUppercase: bool(raw.fixUppercase),
      fixOcr: bool(raw.fixOcr),
      fixOverlaps: bool(raw.fixOverlaps),
      demoteForced: bool(raw.demoteForced),
      dropMismatches: bool(raw.dropMismatches),
      verify: bool(raw.verify),
      relabel: bool(raw.relabel),
      watchOrder: bool(raw.watchOrder),
    };
  } catch {
    return null;
  }
}

/**
 * Overlay a URL config onto the server's defaults.
 *
 * Only fields the user actually set are applied, so a partial config inherits
 * the rest rather than silently resetting it.
 */
export function applyUrlConfig(base: Config, url: UrlConfig): Config {
  const pick = <T>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);
  return {
    ...base,
    upstreamBases: url.upstreams,
    maxResults: pick(url.maxResults, base.maxResults),
    autoShift: pick(url.autoShift, base.autoShift),
    removeHearingImpaired: pick(url.removeHearingImpaired, base.removeHearingImpaired),
    fixUppercase: pick(url.fixUppercase, base.fixUppercase),
    fixOcr: pick(url.fixOcr, base.fixOcr),
    fixOverlaps: pick(url.fixOverlaps, base.fixOverlaps),
    demoteForced: pick(url.demoteForced, base.demoteForced),
    dropMismatches: pick(url.dropMismatches, base.dropMismatches),
    verify: pick(url.verify, base.verify),
    relabel: pick(url.relabel, base.relabel),
    watchOrder: pick(url.watchOrder, base.watchOrder),
  };
}

/**
 * A request's route, once the config and rank segments are stripped.
 *
 * `rank` selects a single position from the ranked list. Installing several
 * rank instances is the only way to get distinguishable rows on clients that
 * label each row with the addon's name and ignore the per-subtitle `label`
 * field — each instance is a separate addon with its own name.
 */
export interface ParsedRoute {
  config: UrlConfig | null;
  rank: number | null;
  /** The remaining path, e.g. `/manifest.json` or `/subtitles/...`. */
  rest: string;
}

export function parseRoute(pathname: string): ParsedRoute {
  let rest = pathname;
  let config: UrlConfig | null = null;
  let rank: number | null = null;

  const cfgMatch = /^\/c\/([A-Za-z0-9_-]+)(\/.*)$/.exec(rest);
  if (cfgMatch) {
    config = decodeUrlConfig(cfgMatch[1]!);
    rest = cfgMatch[2]!;
  }

  const rankMatch = /^\/r\/(\d{1,2})(\/.*)$/.exec(rest);
  if (rankMatch) {
    rank = Number(rankMatch[1]);
    rest = rankMatch[2]!;
  }

  return { config, rank, rest };
}

/** Build the install path for a config, optionally pinned to one rank. */
export function buildInstallPath(config: UrlConfig, rank?: number): string {
  const cfg = encodeUrlConfig(config);
  return rank === undefined
    ? `/c/${cfg}/manifest.json`
    : `/c/${cfg}/r/${rank}/manifest.json`;
}

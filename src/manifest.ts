/**
 * Manifest construction.
 *
 * The manifest is declared locally rather than derived from the upstream's.
 * Spreading the upstream manifest leaks its identifiers — an AIOStreams id
 * embeds the user's config UUID — onto a publicly reachable endpoint, and it
 * advertises stream, catalog and meta resources this addon must not serve.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Read from package.json rather than written here.
 *
 * These drifted: v0.1.1 shipped while the manifest still announced 0.1.0,
 * because releasing means tagging git and nothing made this string follow.
 * A client that reports a version is only useful if the number is true.
 */
function readVersion(): string {
  try {
    const pkg = fileURLToPath(new URL('../package.json', import.meta.url));
    return (JSON.parse(readFileSync(pkg, 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = readVersion();

export interface ManifestOptions {
  name: string;
  /** When set, this instance serves only the nth-ranked subtitle. */
  rank?: number | null;
  /** Public origin, used to point at the icon this server serves itself. */
  publicUrl?: string;
  /** Add the Watch Order row and the playlist metadata. */
  watchOrder?: boolean;
}

/**
 * Names for rank-pinned instances.
 *
 * On clients that label every row with the addon's name and ignore the
 * per-subtitle `label` field, the only way to tell rows apart is for them to
 * come from different addons. Installing several rank instances gives one row
 * per instance, each with its own name. The names are static — a manifest is
 * fetched at install time, not per playback — so they describe the *position*
 * rather than the release.
 */
export function rankName(base: string, rank: number): string {
  if (rank === 1) return `${base} 1 · best match`;
  return `${base} ${rank}`;
}

export function buildManifest({ name, rank, publicUrl, watchOrder }: ManifestOptions): Record<string, unknown> {
  const pinned = typeof rank === 'number';
  // Never on a rank-pinned instance: someone installing several of those
  // would get the same Home row once per instance.
  const playlists = !!watchOrder && !pinned;
  return {
    id: pinned ? `com.subranker.r${rank}` : 'com.subranker',
    version: VERSION,
    name: pinned ? rankName(name, rank!) : name,
    description: pinned
      ? `Position ${rank} of SubRanker's ranked subtitles. Install several of these to tell rows apart on clients that show only the addon name.`
      : 'Ranks, verifies and repairs subtitles so the best match for the release you are playing is first.',
    // Served by this instance rather than fetched from a repository, so it
    // cannot rot: the previous URL pointed at a file that did not exist and
    // Stremio showed the addon with no icon.
    ...(publicUrl ? { logo: `${publicUrl}/logo.svg` } : {}),
    ...(playlists
      ? {
          // Per-resource prefixes: subtitles answer for real titles, meta only
          // for this addon's own playlist ids.
          resources: [
            { name: 'subtitles', types: ['movie', 'series'], idPrefixes: ['tt', 'kitsu'] },
            { name: 'meta', types: ['series'], idPrefixes: ['wo-'] },
          ],
          types: ['movie', 'series'],
          catalogs: [{ type: 'series', id: 'watchorder', name: 'Watch Order' }],
        }
      : { resources: ['subtitles'], types: ['movie', 'series'], idPrefixes: ['tt', 'kitsu'], catalogs: [] }),
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}

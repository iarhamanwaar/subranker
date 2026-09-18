/**
 * Manifest construction.
 *
 * The manifest is declared locally rather than derived from the upstream's.
 * Spreading the upstream manifest leaks its identifiers — an AIOStreams id
 * embeds the user's config UUID — onto a publicly reachable endpoint, and it
 * advertises stream, catalog and meta resources this addon must not serve.
 */

export interface ManifestOptions {
  name: string;
  /** When set, this instance serves only the nth-ranked subtitle. */
  rank?: number | null;
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

export function buildManifest({ name, rank }: ManifestOptions): Record<string, unknown> {
  const pinned = typeof rank === 'number';
  return {
    id: pinned ? `com.subranker.r${rank}` : 'com.subranker',
    version: '0.1.0',
    name: pinned ? rankName(name, rank!) : name,
    description: pinned
      ? `Position ${rank} of SubRanker's ranked subtitles. Install several of these to tell rows apart on clients that show only the addon name.`
      : 'Ranks, verifies and repairs subtitles so the best match for the release you are playing is first.',
    logo: 'https://raw.githubusercontent.com/iarhamanwaar/subranker/main/logo.png',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'kitsu'],
    catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}

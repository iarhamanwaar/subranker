/**
 * Configuration, entirely from the environment.
 *
 * Nothing about any particular deployment belongs in this repository. Upstream
 * addon URLs commonly embed credentials — an AIOStreams manifest URL encodes
 * the user's debrid API key in its base64 config segment — so committing one
 * would publish a secret. `.env.example` carries placeholders only.
 */

export interface Config {
  port: number;
  /**
   * Upstream Stremio subtitle addon, without the trailing `/manifest.json`.
   * Example shape: https://host/stremio/<uuid>/<config>
   */
  upstreamBase: string;
  /** Rewrite `lang` so each row is distinguishable on the client. */
  relabel: boolean;
  /** Remove clear mismatches instead of ranking them low. */
  dropMismatches: boolean;
  /** Download top candidates to check they are alive and in sync. */
  verify: boolean;
  /** How many candidates to download per request. */
  verifyLimit: number;
  /** Seconds to keep a computed response. */
  cacheTtl: number;
  addonName: string;
  /**
   * Diagnostic mode. Returns one subtitle per candidate `lang` format instead
   * of real results, so you can see which formats your client actually
   * renders. Clients differ: Android TV maps `lang` through a language
   * dictionary and draws an empty row for anything it does not recognise.
   */
  probeLabels: boolean;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const upstreamBase = (env.UPSTREAM_BASE ?? '').replace(/\/+$/, '').replace(/\/manifest\.json$/, '');
  if (!upstreamBase) {
    throw new Error(
      'UPSTREAM_BASE is required. Set it to your subtitle addon base URL, ' +
        'without /manifest.json. See .env.example.',
    );
  }

  return {
    port: int(env.PORT, 7010),
    upstreamBase,
    relabel: bool(env.RELABEL, true),
    dropMismatches: bool(env.DROP_MISMATCHES, true),
    verify: bool(env.VERIFY, true),
    verifyLimit: int(env.VERIFY_LIMIT, 15),
    cacheTtl: int(env.CACHE_TTL, 3600),
    addonName: env.ADDON_NAME ?? 'SubRanker',
    probeLabels: bool(env.PROBE_LABELS, false),
  };
}

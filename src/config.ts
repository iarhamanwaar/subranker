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
   * Upstream Stremio subtitle addons, without the trailing `/manifest.json`.
   *
   * Several may be given, comma-separated. They are queried in parallel and
   * merged, which is worth doing because providers expose different metadata:
   * OpenSubtitles V3+ reports `moviehash` (an exact-file signal) while
   * SubSense aggregates ten sources but reports no hash.
   */
  upstreamBases: string[];
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
  /**
   * Cap on returned subtitles; 0 means no cap.
   *
   * Some clients cannot show anything per-subtitle: the Android TV picker
   * labels every row with the addon's name, and both AIOStreams and the client
   * normalise `lang`, so a descriptive label never survives. When rows are
   * indistinguishable, a long list is worse than a short one — the only useful
   * signal left is position, so returning a handful of well-ranked candidates
   * beats returning forty identical ones.
   */
  maxResults: number;
  /**
   * Public origin of this instance, e.g. https://subs.example.com.
   *
   * Required for auto-shift: corrected subtitles are served from this host, so
   * their URLs must be absolute and reachable by the client.
   */
  publicUrl: string;
  /** Serve timing-corrected subtitles in place of drifting ones. */
  autoShift: boolean;
  /**
   * Strip hearing-impaired annotations (`[DOOR CREAKS]`, `DOCTOR:`).
   *
   * Turns an SDH track into an ordinary subtitle, which matters on titles
   * where SDH is the only thing on offer.
   */
  removeHearingImpaired: boolean;
  /** Convert files written entirely in capitals to sentence case. */
  fixUppercase: boolean;
  /** Repair characters that optical recognition routinely confuses. */
  fixOcr: boolean;
  /**
   * Merge cues that share screen time.
   *
   * A player that draws both in the same place renders them on top of each
   * other and neither can be read.
   */
  fixOverlaps: boolean;
  /**
   * Demote forced tracks (signs and foreign dialogue only).
   *
   * They are not wrong, they are simply not what you want when you asked for
   * subtitles, and they look broken if picked by mistake.
   */
  demoteForced: boolean;
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
  const upstreamBases = (env.UPSTREAM_BASE ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/manifest\.json$/, '').replace(/\/+$/, ''))
    .filter((s) => s.length > 0);
  if (upstreamBases.length === 0) {
    throw new Error(
      'UPSTREAM_BASE is required. Set it to your subtitle addon base URL, ' +
        'without /manifest.json. See .env.example.',
    );
  }

  return {
    port: int(env.PORT, 7010),
    upstreamBases,
    relabel: bool(env.RELABEL, true),
    dropMismatches: bool(env.DROP_MISMATCHES, true),
    verify: bool(env.VERIFY, true),
    verifyLimit: int(env.VERIFY_LIMIT, 15),
    cacheTtl: int(env.CACHE_TTL, 3600),
    maxResults: Number(env.MAX_RESULTS ?? 0) || 0,
    publicUrl: (env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
    autoShift: bool(env.AUTO_SHIFT, false),
    removeHearingImpaired: bool(env.REMOVE_HI, false),
    fixUppercase: bool(env.FIX_UPPERCASE, true),
    fixOcr: bool(env.FIX_OCR, true),
    fixOverlaps: bool(env.FIX_OVERLAPS, true),
    demoteForced: bool(env.DEMOTE_FORCED, true),
    addonName: env.ADDON_NAME ?? 'SubRanker',
    probeLabels: bool(env.PROBE_LABELS, false),
  };
}

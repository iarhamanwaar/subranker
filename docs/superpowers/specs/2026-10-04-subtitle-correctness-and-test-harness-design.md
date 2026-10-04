# SubRanker: Subtitle Correctness + Per-Episode Test Harness

**Date:** 2026-10-04
**Status:** Draft design, pending approval
**Approach:** A (rebuild matching around hash/release + anime mapping + multi-source, with an offline test harness)

## Problem

SubRanker exists to deliver the correct, well-synced subtitle for the exact
release being played. Today it often fails, most visibly on anime:

- For Demon Slayer S4E4 (`tt9335498:4:4`), the top **English** sub SubRanker
  returned was a **939-cue file running to 01:01:44** — a batch/wrong-content
  file, not a ~24-minute episode. Its opening lines ("…those darn laws…
  Public Official Identification Card…") are not Demon Slayer at all.
- The result list is **not language-ordered**: French ranked above English.

### Root cause (confirmed by investigation + research)

1. **Anime episode-number mismatch.** IMDb/TVDB/AniDB/Kitsu/MAL number anime
   differently; specials injected into "absolute order" break mappings. The
   free `opensubtitles-v3` upstream does a loose **IMDb-id + season/episode**
   lookup, so for anime it returns the wrong episode or batch files. SubRanker
   re-ranks that set, but cannot rescue a set that is already the wrong
   episode (garbage in → garbage out).
2. **Hash/filename never used to search.** Stremio sends `videoHash` and the
   exact `filename`, but these reach only scoring (`score/score.ts`), never the
   upstream query (`upstream/fetch.ts` forwards the request path verbatim).
   `videoSize` is parsed and used nowhere.
3. **Language is not a ranking signal.** `score/score.ts` has no language
   weight; `lang` is only a per-bucket cap key in `capPerLanguage`. A
   French sub that matches group/timing outranks a less-matched English sub.
4. **Verification cannot detect a wrong/too-long episode.** `verify/fetch.ts`
   marks a sub "ok" if it is *downloadable + parseable with ≥1 cue*. Nothing
   compares the subtitle's runtime (`lastCue`) against the episode runtime, so
   a batch file passes.

## Goals

- **Correct, exact-match English subtitles** for the release being played,
  across all content, with **anime (Demon Slayer) as the proving ground**.
- An **offline, automatic, per-episode test harness** that measures correctness
  and gates every change with a real number.

## Non-goals

- Multi-language correctness tuning (English only for now; the language signal
  is built to generalize later).
- Changing stream caching / the binge-group "uncached Next" behavior — that is
  an AIOStreams/TorBox setting, not SubRanker (tracked separately).
- A full rewrite of `pipeline.ts`/`server.ts`; only the seams these features
  touch are refactored.

## Success criteria

- Harness reports a **baseline** correctness % for Demon Slayer today, then a
  measurable climb after each milestone, targeting **≥95% of sampled episodes**
  returning a correct, English, runtime-verified top sub.
- No top result is a wrong-language or batch/too-long file (hard-rejected).
- When no exact match exists, a **best-effort English sub is returned, clearly
  labeled approximate** (never nothing, never clearly-wrong).

## Decisions (locked)

- **OpenSubtitles official API:** in scope. Free account, API key to be created.
  Hash **search is unlimited**; **downloads are capped (20/day free, 5 without
  account, 1000/day VIP)**. Design must search freely but download sparingly.
- **No-match fallback:** best-effort English sub, clearly flagged as approximate.
- **SubDL:** included only as a **last-resort fallback** (query only when other
  sources return nothing), to respect its 50/day limit and avoid pack/arc
  pollution seen previously.

## Architecture

### Component map (new + changed)

| Unit | Location | Responsibility |
|------|----------|----------------|
| Source adapters | `src/upstream/sources/*` (new) | One adapter per source; given `(RequestIdentity, extras)` return `RawSubtitle[]`, each queried by its best key. |
| Adapter registry / router | `src/upstream/fetch.ts` (extend) | Capability-aware routing (hash-first vs aggregator vs fallback), parallel query, dedup, quota budget. |
| Anime map | `src/meta/anime-map.ts` (new) | IMDb `tt:S:E` ↔ AniDB/Kitsu/absolute via the `anime-lists` dataset. Replaces the hardcoded single-title `meta/arcs.ts` knowledge. |
| Episode runtime | `src/meta/episode.ts` (extend) | Expose expected runtime per episode (Cinemeta/Kitsu) for the runtime check. |
| Language signal | `src/score/score.ts` (extend) | `LANG_PREF` weighting + non-preferred drop/demote. |
| Runtime verification | `src/verify/fetch.ts` + `types.ts` (extend) | Capture subtitle runtime; expose for hard-reject. |
| Hard-reject | `src/score/score.ts` + `src/pipeline.ts` | Drop wrong-language, hash/release-mismatch, and runtime-out-of-range subs. |
| Test harness | `src/harness/*` (new, offline) | Replay log-sampled fixtures through the pipeline, judge with the oracle, emit a report. |

### Data flow (subtitle request)

```
server.ts  parse id + extras (hash, filename, size)
   → meta/anime-map: resolve canonical episode identity (anime)
   → upstream/fetch router:
        OpenSubtitles API  (search by moviehash → imdb+ep+lang)   [primary]
        AnimeTosho         (release-embedded subs, exact)         [anime]
        opensubtitles-v3   (aggregator)                           [fallback]
        SubDL              (only if all above empty)              [last resort]
   → pipeline: parse → score (incl. LANG_PREF) → rank
        → verify (download sparingly; capture runtime)
        → hard-reject (wrong lang / hash-release mismatch / runtime out of range)
        → best-effort flag if no exact match
        → cap → shift/repair → label → response
```

### Source adapters + quota handling

- **OpenSubtitles API (primary).** Search by `moviehash` (unlimited) → exact,
  synced match. Fall back to imdb-id + episode + `languages=en`, filtered by
  release name. **Downloads are the scarce resource:** download only the
  *chosen* sub, cache by hash+file id, and never spend a download during bulk
  timing-verification (keep those on non-quota mirror URLs such as
  `subs5.strem.io`, or skip align when a hash match already guarantees sync).
  If daily download budget is exhausted, degrade to the aggregator rather than
  error. VIP (1000/day) is the documented scaling lever for heavy binge days.
- **AnimeTosho (anime, no key).** Archive-only since May 2026 but holds subs
  embedded in the exact release — strong exact matches for older anime.
- **opensubtitles-v3 (fallback aggregator).** Keep as today; now hard-filtered
  by the new language/runtime/release checks.
- **SubDL (last resort).** Query only when everything above returns nothing.

Adapters share a small interface so capability routing and the harness can
treat them uniformly:

```ts
interface SubtitleSource {
  name: string;
  caps: { hashSearch: boolean; releaseSearch: boolean; quotaLimited: boolean };
  find(identity: RequestIdentity, extras: RequestExtras, budget: Budget): Promise<RawSubtitle[]>;
}
```

### Anime mapping layer

`meta/anime-map.ts` loads the [`anime-lists`](https://github.com/ScudLee/anime-lists)
dataset (IMDb/TVDB ↔ AniDB ↔ absolute), cached on disk and refreshed on a
schedule like the watch-order build. Given `tt:S:E` it yields the canonical
identity used to (a) query anime sources by their native numbering and (b)
translate a source's numbering back to the played release. Supersedes the
hardcoded `meta/arcs.ts` (Demon-Slayer-only) and complements the existing
Kitsu→IMDb path in `upstream/kitsu.ts`.

### Verification changes (contract change — flagged)

- Add `runtimeSeconds` (from `lastCue`) to `Verification` (`types.ts:79-117`),
  computed in `verify/fetch.ts`.
- Expected runtime comes from `meta/episode.ts`. A sub whose runtime is outside
  tolerance (default ±25%, configurable) is **hard-rejected**, not demoted.
- This changes today's "demote, don't drop" philosophy **for clearly-wrong subs
  only** (wrong language, hash/release mismatch with a better candidate present,
  runtime out of range). Ambiguous/sync-only issues keep the demote behavior.

### Test harness (ships first)

- **Fixtures:** sample real `(id, filename, videoHash, videoSize)` tuples from
  production logs (journald on the SubRanker host). Store as JSON fixtures in
  the repo (hashes/sizes only — no copyrighted subtitle content committed).
- **Runner:** for each fixture, run the real pipeline in-process and judge the
  top English result with the oracle:
  - **runtime** within tolerance of expected episode runtime,
  - **release/hash** match to the request,
  - **language == en**,
  - **cue sanity** (count/spacing).
- **Output:** per-episode PASS/FAIL + reason, plus a headline correctness %.
  Re-run after each milestone. Reuses existing pure primitives: `parseRelease`,
  `parseTimeline`/`align`/`isTrustworthy` (`verify/cues.ts`), `scoreCandidate`.
- **Quota safety:** harness uses a local sub cache and must not exceed the
  OpenSubtitles daily download budget; hash-search-only mode for bulk runs.

### Config knobs (new)

`OPENSUBTITLES_API_KEY`, `SOURCES` (ordered enable list),
`LANG_PREF` (default `en`), `DROP_NON_PREFERRED_LANG` (bool),
`RUNTIME_TOLERANCE` (default 0.25), `OS_DOWNLOAD_BUDGET` (default 20),
`ANIME_LISTS_PATH`/refresh schedule, `SUBDL_API_KEY` (fallback only).

### Targeted refactors (only what these features force)

- Thread `parsed.extras` from `server.ts:211` into `upstream/fetch.ts` and
  `verify/` (today they stop at scoring).
- Extract the inline shift-rewrite lambda out of `runPipeline`
  (`pipeline.ts:298-338`) into `shift/`.
- Move the anime neighbour-season widening out of the HTTP handler
  (`server.ts:247-266`) into the meta/upstream layer, superseded by the anime
  map.

## Sequencing (each milestone gated by the harness)

1. **Harness + baseline** — measure today's Demon Slayer correctness %.
2. **Language signal + runtime hard-reject** — cheap, large jump; re-measure.
3. **Anime mapping layer** — fixes wrong-episode at the source; re-measure.
4. **Source adapters** — OpenSubtitles (hash-first) + AnimeTosho, then SubDL
   fallback; re-measure to target.

## Testing

- Unit tests for: anime-map resolution (incl. specials/absolute edge cases),
  language scoring, runtime reject thresholds, adapter capability routing,
  quota-budget degradation.
- The harness itself is the integration/regression gate; its baseline and
  post-milestone numbers are recorded in the PR.

## Risks / open items

- **OpenSubtitles download quota (20/day free).** Mitigated by hash-search-only
  bulk runs, winner-only downloads, and aggressive caching; VIP is the lever if
  real family usage exceeds it. Confirm exact current limits at implementation.
- **anime-lists coverage/freshness** for brand-new seasonal anime — fall back to
  Kitsu/Cinemeta identity when unmapped.
- **Expected-runtime accuracy** from Cinemeta/Kitsu for anime can be rough;
  tolerance default is generous (±25%) and configurable.
- **Two subtitle addons on the TV** (AIOStreams own-subs + SubRanker) is a
  separate setup issue; needs the Stremio auth / AIOStreams config to resolve
  and is not part of this spec.

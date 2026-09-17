# SubRanker

A Stremio addon that sits in front of any subtitle addon and makes the list
usable: it ranks candidates against the release you are actually playing,
removes dead and mismatched tracks, and rewrites each row so you can tell them
apart.

Works for movies, TV and anime alike — nothing in it assumes a content type.

## The problem

Ask a subtitle aggregator for English subtitles and you can easily get 45
results. Three things then go wrong, and all three were measured on a live setup
rather than guessed:

**They look identical.** Stremio's subtitle object carries only `id`, `url` and
`lang`, and the client renders the language verbatim. Addons that attach
`label` or `releaseName` are ignored. So 45 English subtitles render as 45 rows
reading "English", and you pick blind.

**Many are dead.** Roughly half of one provider's links returned 404 — from a
home connection and a datacenter alike. Choosing one is a silent failure.

**They are cut for different videos.** Three "English S01E01" tracks for the
same episode had last cues at 21:06, 23:24 and 23:36 — a 150-second spread.
Two legitimate ones still differed by 262ms, which is invisible in a list and
very visible on screen. A third was timed to the English dub, putting its first
cue at 6.2s against 25.4s for the subbed tracks.

More subtitles does not fix any of that. Ranking does.

## What it does

```
client → subranker → your subtitle addon → providers
             │
             └── parse · verify · score · rank · relabel
```

1. **Parse** every candidate's release name, and the filename of the stream
   being played.
2. **Verify** the top candidates by downloading them in parallel: drop dead
   links, then align each cue timeline against a reference to measure offset
   and framerate drift.
3. **Score** on matched properties, modelled on Subliminal: release group
   weighted heavily, then source, resolution, episode and season. An exact
   file-hash match outweighs the sum of everything else.
4. **Rank**, dropping clear mismatches.
5. **Relabel** so rows read `01. English · erai-raws · in sync` instead of
   forty-five identical "English".

### Content-type handling

Content type cannot be inferred from the Stremio id — Demon Slayer arrives as a
plain IMDb id yet ships fansub-style release names. So every candidate is run
through both an anime parser ([anitomy-ng](https://www.npmjs.com/package/anitomy-ng),
a WebAssembly build with no native dependencies) and a Radarr-style parser
([@ctrl/video-filename-parser](https://www.npmjs.com/package/@ctrl/video-filename-parser)),
and the higher-confidence result wins, with fields merged.

### Timing verification

Alignment compares a candidate's cue timeline against a reference timeline
rather than against audio. No video is decoded and no bytes of the stream are
fetched, so it takes milliseconds rather than the 20–30 seconds an audio-based
aligner such as ffsubsync needs. It tries the usual framerate ratios
(23.976 ↔ 25 ↔ 24), so subtitles that *drift* are distinguished from subtitles
that are merely *late*.

### Dub handling

A dub-timed track is treated as a sync failure rather than a preference: a dub
is a different vocal performance, so its cues drift against the original audio.
SDH tracks are only demoted when a non-SDH alternative survives, so an obscure
title never returns an empty list.

## Setup

Requires Node 20+.

```bash
pnpm install
cp .env.example .env     # set UPSTREAM_BASE
pnpm build && pnpm start
```

Then install `https://your-host/manifest.json` in Stremio.

> **Never commit your `UPSTREAM_BASE`.** Addon URLs frequently embed API keys in
> their config segment.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `UPSTREAM_BASE` | *(required)* | Upstream subtitle addon, without `/manifest.json` |
| `PORT` | `7010` | Loopback bind port |
| `RELABEL` | `true` | Rewrite `lang` so rows are distinguishable |
| `DROP_MISMATCHES` | `true` | Remove mismatches instead of ranking them low |
| `VERIFY` | `true` | Download top candidates to check liveness and timing |
| `VERIFY_LIMIT` | `15` | How many to download per request |
| `CACHE_TTL` | `3600` | Seconds to cache a computed response |

## Development

```bash
pnpm test        # unit tests
pnpm typecheck
pnpm dev         # watch mode

UPSTREAM_BASE=… pnpm exec tsx scripts/e2e.ts   # run against a live addon
```

## A note on client behaviour

Stremio can append `videoHash`, `videoSize` and `filename` to subtitle requests,
and those extras are what make exact matching possible. Not every client sends
them — the Android TV and web clients have been reported to omit the segment
([stremio-addon-sdk#221](https://github.com/Stremio/stremio-addon-sdk/issues/221)).
SubRanker degrades gracefully: without extras it still prunes dead links,
removes dub-timed tracks, verifies timing and relabels. With them, ranking
becomes exact.

## License

MIT

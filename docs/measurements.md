# What is actually wrong with Stremio subtitles

Every number here came from running the code against live subtitle providers
and real files. Where a figure depends on which provider you ask, it says so,
because most of them do. Reproduce any of it with the scripts in `scripts/`.

## The list you get is mostly noise

Asking an aggregator for English subtitles on one episode returns around 30 to
45 candidates. They are not 45 different qualities of the same thing. They are
a mix of: files for a different release, files that no longer download, files
in the wrong encoding, signs-only tracks, and a handful of good ones.

The client shows them in whatever order the provider returned, which is not
related to whether they will work.

## Dead links

**Roughly half of one provider's results did not download.** Not slow, not
malformed. Gone.

This is the single largest win and the least interesting technically. The
aggregator never checks, because checking means fetching every candidate, and
it is optimising for a fast response. So the user does the checking, one
selection at a time, during playback.

Worth stating plainly: this is provider-specific. On the run recorded in
`scripts/e2e.ts` against OpenSubtitles v3, **zero** of 30 dropped. The
providers that aggregate other providers are where the dead links concentrate.

## Ranking changes the answer

On *Demon Slayer* S01E01, matching the release name moved the correct
`erai-raws` subtitle **from 7th to 1st**. Nothing about the file changed. The
information needed to rank it was in the filename the whole time, and nothing
in the chain was reading it.

Two parsers run over every candidate, because one grammar does not cover the
ecosystem: `anitomy-ng` for anime fansub naming, and a Radarr-style parser for
scene and web releases. Content type cannot be inferred from the Stremio id, so
both always run and the better-supported result wins.

## Timing

A subtitle can be correct and still unusable. Two failure modes, both fixable:

- **Constant offset.** The file was cut for a release with a different intro.
- **Framerate drift.** The file was authored at 23.976fps and the video is 25,
  or the reverse. The error grows across the episode, so it looks fine for the
  first five minutes and is seconds out by the end.

Correcting this without the audio is possible because you have something
better: the other candidates. Cue timelines are compared against a consensus
built from the candidates that agree with each other, and offset and rate are
solved against that.

The guard rails matter more than the algorithm. An early version applied
+176.5s at rate 1.042 to every candidate and would have wrecked every subtitle
it touched. A correction is now only applied when the offset is within 30
seconds, the agreement is above half, and a non-identity framerate beats the
identity hypothesis by a clear margin.

## Encoding

**About 14% of sampled files were mojibake** — CP1252 bytes read as something
else, so apostrophes and accents render as `â€™`.

The repair maps from CP1252 specifically, not Latin-1. This matters: `€`
(U+20AC) and `™` (U+2122) are above U+00FF and a Latin-1 table silently drops
them.

## Overlapping cues

When two characters speak at once, many files carry two cues covering the same
span, and the player draws them on top of each other.

Merging them is easy. Merging them *in the file's own style* is the part worth
noting. Across the corpus, dash conventions split 719 spaced against 698
unspaced, which looks like a coin toss until you notice that each individual
file is internally consistent. So the style is detected per file rather than
picked globally.

## Where the time goes

Cold request cost is dominated by network, not computation.

| Stage | Time |
|---|---|
| Upstream fetch (parallel) | 0.6–1.9s |
| Verification downloads | 2.4–2.7s |
| Parse, score, rank | 1–36ms |

Per-file download latency is a median of 414ms and a p90 of 897ms, which is why
the per-file timeout is 2.5s rather than something generous. A file slower than
that is marked unverified instead of dropped: it still reaches the client, it
just stops holding up the response.

**The one real optimisation.** Comparing cue timelines was a full cross
product, roughly 300×300 per pair, across every pair of candidates. About 30M
iterations, and about 6 seconds. Both timelines are sorted, so the reference
cues inside the offset window form a contiguous run; walking it with two
pointers made the stage effectively free.

A caution on benchmarking this: an early "60× speedup" was an artifact. The
harness omitted the verification timeout, so `setTimeout(fn, undefined)` fired
immediately, every fetch aborted, and nothing was verified. It is fast to do
nothing. There is now a test asserting the timeout is actually set.

## The wall we could not get past

All of the above is server-side and works. The last inch does not.

Stremio's addon protocol has a `label` field on subtitle objects. It is
accepted, carried through the type, and **never read** on the way to the view
layer. On the Android TV client the documented `lang` free-text fallback is
also ignored, so there is no workaround at all: every row renders as the addon
name.

```
English   SubRanker
English   SubRanker
English   SubRanker
```

Embedded tracks in the video container *do* render their own names in that same
picker, so the UI is capable of drawing a per-row string. Addon subtitles are
simply not wired to it.

The consequence is that ranking is invisible. Putting the right subtitle first
works, but if the user needs the second one they are back to trial and error.

Tracked upstream at [stremio-core#936](https://github.com/Stremio/stremio-core/issues/936)
and [#907](https://github.com/Stremio/stremio-core/issues/907).

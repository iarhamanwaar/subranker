/**
 * The request pipeline: fetch upstream, parse, verify, score, rank, relabel.
 */
import type { Config } from './config.js';
import { buildLabel, buildRowLabel } from './label/label.js';
import { parseRelease } from './parse/release.js';
import { detectForced, isForced } from './parse/forced.js';
import { applyTimingScore, rank, scoreAll } from './score/score.js';
import type { Candidate, ParsedRelease, RawSubtitle, RequestExtras } from './types.js';
import { DEFAULT_FETCH_OPTIONS, fetchAndInspect, withAlignment } from './verify/fetch.js';
import { align, isTrustworthy, type Timeline } from './verify/cues.js';
import { isShiftSafeToApply } from './shift/rewrite.js';
import { buildShiftPath, isFetchableUrl } from './shift/route.js';

/** Best human-readable release string available for a candidate. */
export function releaseTextOf(raw: RawSubtitle): string {
  const candidates = [raw.releaseName, raw.fileName, raw.title, raw.label, raw.id];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim();
  }
  return '';
}

export async function buildCandidates(subs: RawSubtitle[]): Promise<Candidate[]> {
  return Promise.all(
    subs.map(async (raw) => {
      const releaseText = releaseTextOf(raw);
      return {
        raw,
        releaseText,
        parsed: await parseRelease(releaseText),
        score: 0,
        reasons: [],
      };
    }),
  );
}

/**
 * Pick the timeline that the most other timelines agree with.
 *
 * Using the highest-scoring candidate as the anchor is circular: when the
 * release name carries no group, the top score is close to arbitrary, and
 * anchoring on a badly-timed file would then punish every correctly-timed one.
 * The medoid — the timeline with the best total agreement against the rest — is
 * the one the majority of independent uploaders converged on, which is a far
 * better estimate of the video's real timing.
 */
export interface Consensus {
  reference: Timeline;
  /**
   * Fraction of the other timelines that agree with the reference.
   *
   * This is the anchor's own trustworthiness. If most uploaders disagree with
   * the chosen reference there is no consensus to speak of, and any offset
   * measured against it is meaningless — which is exactly how a bogus
   * +176s/1.042 "correction" was once produced for every candidate.
   */
  support: number;
}

/** Agreement above which two timelines are considered to be the same cut. */
const SAME_CUT_AGREEMENT = 0.5;

export function consensusTimeline(timelines: Timeline[]): Consensus {
  const usable = timelines.filter((t) => t.length >= 5);
  if (usable.length === 0) return { reference: timelines[0] ?? [], support: 0 };
  if (usable.length === 1) return { reference: usable[0]!, support: 1 };

  let best = usable[0]!;
  let bestSupport = -1;

  for (const candidate of usable) {
    let agreeing = 0;
    for (const other of usable) {
      if (other === candidate) continue;
      // Judged at rate 1 with a tight offset window on purpose. Scoring the
      // medoid on a fully-maximised alignment lets a pathological timeline
      // "agree" with everything by stretching itself, and it then wins the
      // vote.
      const a = align(other, candidate, { rates: [1], maxOffset: 30 });
      if (a.agreement >= SAME_CUT_AGREEMENT) agreeing += 1;
    }
    const support = agreeing / (usable.length - 1);
    if (support > bestSupport) {
      bestSupport = support;
      best = candidate;
    }
  }

  return { reference: best, support: Math.max(bestSupport, 0) };
}

/**
 * Download the top candidates, drop the dead ones and measure how well the rest
 * line up against the consensus timeline.
 */
async function verifyTop(
  candidates: Candidate[],
  limit: number,
  timeoutMs: number,
): Promise<Candidate[]> {
  const top = candidates.slice(0, limit);
  const rest = candidates.slice(limit);

  const fetched = await Promise.all(
    top.map(async (c) => ({
      c,
      result: await fetchAndInspect(c.raw.url, { ...DEFAULT_FETCH_OPTIONS, timeoutMs }),
    })),
  );

  const alive = fetched.filter((f) => f.result.verification.ok);
  const { reference, support } = consensusTimeline(alive.map((f) => f.result.timeline));

  // With no majority behind the anchor there is nothing to measure against, so
  // report timings as unknown rather than inventing corrections from noise.
  const anchored = support >= 0.5;

  const verified: Candidate[] = [];
  for (const { c, result } of fetched) {
    if (result.verification.ok) {
      const verification = anchored
        ? withAlignment(result.verification, result.timeline, reference)
        : result.verification;
      const next: Candidate = { ...c, verification };

      if (
        verification.agreement !== undefined &&
        reference.length > 0 &&
        result.timeline !== reference &&
        !isTrustworthy({
          offset: verification.offset ?? 0,
          rate: verification.rate ?? 1,
          agreement: verification.agreement,
        })
      ) {
        next.score -= 60;
        next.reasons = [...next.reasons, 'timing mismatch'];
      }
      verified.push(next);
      continue;
    }

    // A refusal aimed at our IP says nothing about whether the client can fetch
    // it, so keep those; a genuine dead link is removed.
    if (result.blocked) {
      verified.push({ ...c, verification: result.verification });
    } else {
      verified.push({ ...c, verification: result.verification, dropped: 'dead link' });
    }
  }

  return [...verified, ...rest];
}

export interface PipelineResult {
  subtitles: Array<{ id: string; url: string; lang: string; label?: string }>;
  stats: {
    received: number;
    dropped: number;
    returned: number;
    verified: number;
    target: ParsedRelease;
  };
}

export async function runPipeline(
  subs: RawSubtitle[],
  extras: RequestExtras,
  config: Config,
): Promise<PipelineResult> {
  const target = await parseRelease(extras.filename ?? '');
  const candidates = await buildCandidates(subs);

  const scored = scoreAll(candidates, target, extras, {
    preferSubbed: true,
    dropMismatches: config.dropMismatches,
  });

  let ordered = rank(scored);

  if (config.verify && ordered.length > 0) {
    let checked = await verifyTop(ordered, config.verifyLimit, config.verifyTimeoutMs);

    if (config.demoteForced) {
      // A forced track covers signs only. It is not wrong, it is simply not
      // what was asked for, and it looks broken if picked: long silences,
      // then one line. Detected after verification because the cue count is
      // the signal that works regardless of how the track is named.
      checked = checked.map((c) => {
        const signals = detectForced(c.releaseText, c.verification);
        if (!isForced(signals)) return c;
        return {
          ...c,
          score: c.score - 120,
          reasons: [...c.reasons, 'forced'],
        };
      });
    }

    ordered = rank(applyTimingScore(checked));
  }

  if (config.maxResults > 0) ordered = ordered.slice(0, config.maxResults);

  // Auto-shift: alignment already measured what is wrong with the timing, so
  // serve the corrected file rather than leaving the viewer to nudge Delay by
  // hand. Only candidates we successfully downloaded are rewritten — if our own
  // fetch was refused we cannot correct the file, and the client should go to
  // the original URL untouched.
  if (config.autoShift && config.publicUrl) {
    ordered = ordered.map((c) => {
      const v = c.verification;
      if (!v?.ok || v.offset === undefined || v.rate === undefined) return c;
      const shift = { offset: v.offset, rate: v.rate };
      const needsShift = isShiftSafeToApply(shift, v.agreement);
      const hasAds = (v.adCues ?? 0) > 0;
      const badEncoding = v.encodingRepaired === true;

      let flags = '';
      if (config.removeHearingImpaired && (v.hiCues ?? 0) > 0) flags += 'h';
      if (config.fixUppercase && v.allCaps === true) flags += 'u';
      if (config.fixOcr && (v.ocrCues ?? 0) > 0) flags += 'o';
      if (config.fixOverlaps && (v.overlapCues ?? 0) > 0) flags += 'v';

      const needsCleanup = flags.length > 0;
      if ((!needsShift && !hasAds && !badEncoding && !needsCleanup) || !isFetchableUrl(c.raw.url)) {
        return c;
      }

      // A file with banners is worth proxying even when its timing is fine.
      const applied = needsShift ? shift : { offset: 0, rate: 1 };
      const reasons = [...c.reasons];
      if (needsShift) reasons.push('timing corrected');
      if (hasAds) reasons.push('ads removed');
      if (badEncoding) reasons.push('encoding fixed');
      if (flags.includes('h')) reasons.push('HI tags removed');
      if (flags.includes('u')) reasons.push('caps fixed');
      if (flags.includes('o')) reasons.push('OCR fixed');
      if (flags.includes('v')) reasons.push('overlaps merged');
      return {
        ...c,
        raw: { ...c.raw, url: `${config.publicUrl}${buildShiftPath({ ...applied, url: c.raw.url, flags })}` },
        reasons,
      };
    });
  }

  const subtitles = ordered.map((c, i) => ({
    id: c.raw.id,
    url: c.raw.url,
    lang: config.relabel ? buildLabel(c, i, ordered.length) : c.raw.lang,
    // Carried separately from `lang` so the language column stays correct
    // while the per-row text still says which release this is.
    label: buildRowLabel(c, i, ordered.length),
  }));

  return {
    subtitles,
    stats: {
      received: subs.length,
      dropped: subs.length - ordered.length,
      returned: ordered.length,
      verified: ordered.filter((c) => c.verification?.ok).length,
      target,
    },
  };
}

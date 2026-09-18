/**
 * Candidate scoring.
 *
 * Modelled on Subliminal's approach: extract properties from the file being
 * played and from each subtitle's release name, then sum weighted matches. The
 * hash weight deliberately exceeds the sum of every other weight, so an exact
 * file match always sorts first no matter what else disagrees.
 */
import type { Candidate, ParsedRelease, RequestExtras } from '../types.js';

export const WEIGHTS = {
  group: 40,
  source: 18,
  resolution: 10,
  videoCodec: 6,
  episode: 14,
  season: 10,
  year: 8,
  title: 4,
} as const;

/** Strictly greater than the sum of all other weights, so a hash match wins. */
export const HASH_WEIGHT =
  Object.values(WEIGHTS).reduce((a, b) => a + b, 0) + 1;

/** Applied only when at least one non-SDH candidate survives. */
export const SDH_PENALTY = 25;

/**
 * Penalties for properties that are present on both sides and disagree.
 *
 * Scoring only ever added points for matches, so a candidate could rank well
 * purely on timing while contradicting the release outright — a `WEB 480p`
 * subtitle outranked `erai-raws 1080p` against a `Bluray-1080p` target.
 * A stated disagreement is evidence, not merely an absent match.
 *
 * Only applied when both sides state a value: most subtitles name neither a
 * source nor a resolution, and silence must stay free.
 */
export const MISMATCH_PENALTIES = {
  source: 16,
  resolution: 8,
} as const;

/**
 * Maximum bonus awarded for agreeing with the consensus timeline.
 *
 * This is the fallback evidence when the release name carries no group. Players
 * are often fed library-renamed files — `Demon Slayer - S01E01 - Cruelty
 * Bluray-1080p.mkv` names the source and resolution but no release group — and
 * in that case the group weight can never fire. Measured timing agreement is
 * then the strongest signal available, so it is weighted just below a group
 * match rather than as a tiebreaker.
 */
export const TIMING_BONUS = 34;

/**
 * Redistribution applied when the target names no release group.
 *
 * The group weight is dead in that case, so the remaining name-derived
 * properties are worth proportionally more.
 */
const NO_GROUP_MULTIPLIER = 1.6;

export interface ScoreOptions {
  /** Preference for the original audio with translated subtitles. */
  preferSubbed: boolean;
  /** Remove candidates judged clear mismatches instead of ranking them low. */
  dropMismatches: boolean;
}

export const DEFAULT_SCORE_OPTIONS: ScoreOptions = {
  preferSubbed: true,
  dropMismatches: true,
};

function hasHashMatch(raw: Candidate['raw'], extras: RequestExtras): boolean {
  if (!extras.videoHash) return false;
  const h = raw.moviehash;
  if (h === true) return true;
  if (typeof h === 'string' && h.toLowerCase() === extras.videoHash.toLowerCase()) return true;
  return false;
}

/**
 * Score one candidate against the target release.
 *
 * Returns the score and the reasons behind it. `dropped` is set when the
 * candidate should be removed rather than merely ranked low.
 */
export function scoreCandidate(
  candidate: Candidate,
  target: ParsedRelease,
  extras: RequestExtras,
  options: ScoreOptions,
): { score: number; reasons: string[]; dropped?: string } {
  const reasons: string[] = [];
  const p = candidate.parsed;
  let score = 0;

  // --- disqualifications -------------------------------------------------

  // A dub-timed track is not a taste mismatch but a sync failure: a dub is a
  // different vocal performance, so its cues drift against the original audio.
  if (options.preferSubbed && p.dub && !target.dub) {
    if (options.dropMismatches) return { score: -1, reasons: ['dub-timed'], dropped: 'dub-timed' };
    score -= 200;
    reasons.push('dub-timed');
  }

  // Wrong episode is never recoverable, however well everything else matches.
  if (
    target.episode !== undefined &&
    p.episode !== undefined &&
    p.episode !== target.episode &&
    options.dropMismatches
  ) {
    return { score: -1, reasons: ['wrong episode'], dropped: 'wrong episode' };
  }

  // --- positive evidence -------------------------------------------------

  if (hasHashMatch(candidate.raw, extras)) {
    score += HASH_WEIGHT;
    reasons.push('exact file match');
  }

  // With no group on the target, the group weight can never fire, so the other
  // name-derived properties carry the decision.
  const boost = target.group ? 1 : NO_GROUP_MULTIPLIER;

  if (target.group && p.group && target.group === p.group) {
    score += WEIGHTS.group;
    reasons.push(p.group);
  }
  if (target.source && p.source) {
    if (target.source === p.source) {
      score += WEIGHTS.source * boost;
      reasons.push(p.source.toUpperCase());
    } else {
      score -= MISMATCH_PENALTIES.source;
    }
  }
  if (target.resolution && p.resolution) {
    if (target.resolution === p.resolution) {
      score += WEIGHTS.resolution * boost;
    } else {
      score -= MISMATCH_PENALTIES.resolution;
    }
  }
  if (target.videoCodec && p.videoCodec && target.videoCodec === p.videoCodec) {
    score += WEIGHTS.videoCodec * boost;
  }
  if (target.episode !== undefined && p.episode === target.episode) {
    score += WEIGHTS.episode;
  }
  if (target.season !== undefined && p.season === target.season) {
    score += WEIGHTS.season;
  }
  if (target.year !== undefined && p.year === target.year) {
    score += WEIGHTS.year;
  }
  if (target.title && p.title && normalise(target.title) === normalise(p.title)) {
    score += WEIGHTS.title;
  }

  if (p.sdh) reasons.push('SDH');

  return { score, reasons };
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Score every candidate, then apply the rules that depend on the field as a
 * whole rather than on any single candidate.
 *
 * The SDH penalty is one of those: SDH is only demoted when a non-SDH
 * alternative actually survived, so an obscure title never ends up with an
 * empty list.
 */
export function scoreAll(
  candidates: Candidate[],
  target: ParsedRelease,
  extras: RequestExtras,
  options: ScoreOptions = DEFAULT_SCORE_OPTIONS,
): Candidate[] {
  const scored = candidates.map((c) => {
    const { score, reasons, dropped } = scoreCandidate(c, target, extras, options);
    return { ...c, score, reasons, dropped };
  });

  const survivors = scored.filter((c) => !c.dropped);
  const hasNonSdh = survivors.some((c) => !c.parsed.sdh);
  if (hasNonSdh) {
    for (const c of survivors) if (c.parsed.sdh) c.score -= SDH_PENALTY;
  }

  return scored;
}

/**
 * Fold measured timing agreement into the score.
 *
 * Call this after verification. Agreement with the consensus timeline is
 * evidence the subtitle is cut for the same video, which matters most when the
 * release name gave us nothing to match on.
 */
export function applyTimingScore(candidates: Candidate[]): Candidate[] {
  return candidates.map((c) => {
    const a = c.verification?.agreement;
    if (!c.verification?.ok || a === undefined) return c;

    const bonus = Math.round(TIMING_BONUS * Math.min(Math.max(a, 0), 1));
    const reasons = [...c.reasons];
    if (a >= 0.6) reasons.push('timing confirmed');
    return { ...c, score: c.score + bonus, reasons };
  });
}

/** Rank survivors best-first; dropped candidates are excluded. */
export function rank(scored: Candidate[]): Candidate[] {
  return scored
    .filter((c) => !c.dropped)
    .sort((a, b) => b.score - a.score || a.raw.id.localeCompare(b.raw.id));
}

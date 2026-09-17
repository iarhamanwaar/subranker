/**
 * The request pipeline: fetch upstream, parse, verify, score, rank, relabel.
 */
import type { Config } from './config.js';
import { buildLabel } from './label/label.js';
import { parseRelease } from './parse/release.js';
import { rank, scoreAll } from './score/score.js';
import type { Candidate, ParsedRelease, RawSubtitle, RequestExtras } from './types.js';
import { DEFAULT_FETCH_OPTIONS, fetchAndInspect, withAlignment } from './verify/fetch.js';
import { isTrustworthy, type Timeline } from './verify/cues.js';

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
 * Download the top candidates, drop the dead ones and measure how well the rest
 * line up.
 *
 * The reference timeline is the highest-scoring candidate that downloaded
 * cleanly — by that point it is the one most likely to be cut for this exact
 * release, which makes it a better anchor than any single provider.
 */
async function verifyTop(candidates: Candidate[], limit: number): Promise<Candidate[]> {
  const top = candidates.slice(0, limit);
  const rest = candidates.slice(limit);

  const fetched = await Promise.all(
    top.map(async (c) => ({ c, result: await fetchAndInspect(c.raw.url, DEFAULT_FETCH_OPTIONS) })),
  );

  const alive = fetched.filter((f) => f.result.verification.ok);
  const reference: Timeline = alive[0]?.result.timeline ?? [];

  const verified: Candidate[] = [];
  for (const { c, result } of fetched) {
    if (result.verification.ok) {
      const verification = withAlignment(result.verification, result.timeline, reference);
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
  subtitles: Array<{ id: string; url: string; lang: string }>;
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
    const checked = await verifyTop(ordered, config.verifyLimit);
    ordered = rank(checked);
  }

  const subtitles = ordered.map((c, i) => ({
    id: c.raw.id,
    url: c.raw.url,
    lang: config.relabel ? buildLabel(c, i, ordered.length) : c.raw.lang,
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

/**
 * Subtitle cue parsing and timeline alignment.
 *
 * Alignment compares a candidate's cue timeline against a reference timeline
 * rather than against audio. That is the cheap trick: no video is decoded and
 * no bytes of the stream are fetched, so it runs in milliseconds instead of the
 * 20-30 seconds an audio-based aligner such as ffsubsync needs.
 */

/** Cue start times, in seconds, ascending. */
export type Timeline = number[];

const TIME_RE =
  /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/g;

/**
 * Framerate ratios worth trying. A subtitle authored for 23.976fps played
 * against 25fps (or the reverse) drifts progressively rather than sitting at a
 * constant offset, which no amount of delay adjustment can fix.
 */
export const RATE_CANDIDATES = [
  1, 25 / 23.976, 23.976 / 25, 24 / 23.976, 23.976 / 24, 25 / 24, 24 / 25,
] as const;

/**
 * Extract cue start times from SRT, VTT or ASS content.
 *
 * Advertising cues that some providers inject at the very start (OpenSubtitles
 * V3+ adds one at 00:00:01) are dropped, since they would otherwise anchor the
 * alignment to a line that is not in the video at all.
 */
export function parseTimeline(content: string): Timeline {
  const times: number[] = [];

  TIME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RE.exec(content)) !== null) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const s = Number(m[3]);
    const ms = Number((m[4] ?? '0').padEnd(3, '0'));
    times.push(h * 3600 + min * 60 + s + ms / 1000);
  }

  // ASS/SSA uses `Dialogue: 0,0:00:25.37,0:00:26.46,...`
  if (times.length === 0) {
    for (const line of content.split(/\r?\n/)) {
      const d = /^Dialogue:\s*[^,]*,\s*(\d):(\d{2}):(\d{2})[.,](\d{1,2})/.exec(line);
      if (d) {
        times.push(
          Number(d[1]) * 3600 +
            Number(d[2]) * 60 +
            Number(d[3]) +
            Number((d[4] ?? '0').padEnd(2, '0')) / 100,
        );
      }
    }
  }

  times.sort((a, b) => a - b);
  return stripInjectedHeader(times);
}

/**
 * Drop a lone cue sitting well before the body of the subtitle. Providers use
 * that slot for attribution banners.
 */
function stripInjectedHeader(times: Timeline): Timeline {
  if (times.length < 3) return times;
  const [first, second] = [times[0]!, times[1]!];
  if (first <= 2 && second - first > 5) return times.slice(1);
  return times;
}

export interface Alignment {
  /** Seconds to add to the candidate to reach the reference. */
  offset: number;
  /** Multiplier applied to the candidate's timeline before the offset. */
  rate: number;
  /** Fraction of candidate cues that land near a reference cue, 0..1. */
  agreement: number;
}

/**
 * Estimate how a candidate timeline maps onto a reference timeline.
 *
 * For each plausible framerate ratio we histogram the pairwise differences and
 * take the densest bin as the offset; the ratio whose peak is densest wins.
 * This tolerates the two timelines having quite different cue counts, which is
 * normal when one is SDH and the other is not.
 */
export interface AlignOptions {
  /** Ignore hypotheses that shift further than this, in seconds. */
  maxOffset?: number;
  /** Restrict the framerate ratios considered. */
  rates?: readonly number[];
  /**
   * How much better a non-1 rate must score before it is preferred.
   *
   * Rate scaling is powerful enough to manufacture coincidences: stretching a
   * timeline by 4.2% can line up unrelated cues well enough to beat the truth.
   * Requiring a clear margin keeps `rate` at 1 unless drift is real.
   */
  rateMargin?: number;
}

export function align(
  candidate: Timeline,
  reference: Timeline,
  options: AlignOptions = {},
): Alignment {
  const empty: Alignment = { offset: 0, rate: 1, agreement: 0 };
  if (candidate.length < 5 || reference.length < 5) return empty;

  const BIN = 0.25; // seconds
  const MAX_OFFSET = options.maxOffset ?? 180;
  const rates = options.rates ?? RATE_CANDIDATES;
  const rateMargin = options.rateMargin ?? 0.08;
  let best = empty;
  let identityAgreement = 0;

  for (const rate of rates) {
    const hist = new Map<number, number>();
    for (const a of candidate) {
      const scaled = a * rate;
      for (const b of reference) {
        const d = b - scaled;
        if (d < -MAX_OFFSET || d > MAX_OFFSET) continue;
        const bin = Math.round(d / BIN);
        hist.set(bin, (hist.get(bin) ?? 0) + 1);
      }
    }
    for (const [bin, count] of hist) {
      const agreement = Math.min(count / Math.min(candidate.length, reference.length), 1);
      if (rate === 1 && agreement > identityAgreement) identityAgreement = agreement;
      if (agreement > best.agreement) {
        best = { offset: bin * BIN, rate, agreement };
      }
    }
  }

  // Fall back to the identity rate unless the drift hypothesis is clearly
  // better; otherwise a manufactured stretch wins over the honest answer.
  if (best.rate !== 1 && best.agreement - identityAgreement < rateMargin) {
    return align(candidate, reference, {
      ...options,
      rates: [1],
      rateMargin: Number.POSITIVE_INFINITY,
    });
  }

  return best;
}

/**
 * Whether an alignment indicates a subtitle that will actually track the video.
 *
 * A large offset is correctable and a rate other than 1 means progressive
 * drift, but low agreement means the two timelines are simply not the same
 * content — that is the disqualifying case.
 */
export function isTrustworthy(a: Alignment, minAgreement = 0.35): boolean {
  return a.agreement >= minAgreement;
}

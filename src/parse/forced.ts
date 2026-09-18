/**
 * Forced-subtitle detection.
 *
 * A forced track covers only signs and foreign dialogue — the lines you need
 * even when you understand the spoken language. It is useless as a full
 * subtitle and will look broken if picked by mistake: long silences, then a
 * line, then nothing for ten minutes.
 *
 * Detection uses two independent signals, because neither is reliable alone.
 * The name often says so, but plenty of forced tracks are named like any
 * other; the cue count gives it away regardless of the name.
 */
import type { Verification } from '../types.js';

const FORCED_NAME = /\b(forced|forcedn?arrative|signs?[\s._-]?(and|&)?[\s._-]?songs?)\b/i;

/**
 * A full-length subtitle has hundreds of cues. Below this many, for a piece of
 * normal running time, the track is covering signs rather than dialogue.
 */
const FORCED_CUE_CEILING = 90;

/** Minimum span, in seconds, before a low cue count means anything. */
const MIN_SPAN_SECONDS = 20 * 60;

export interface ForcedSignals {
  /** The release name advertises a forced track. */
  byName: boolean;
  /** The cue density is far too low for full dialogue. */
  byDensity: boolean;
}

export function detectForced(releaseText: string, verification?: Verification): ForcedSignals {
  const byName = FORCED_NAME.test(releaseText);

  let byDensity = false;
  const cues = verification?.cueCount;
  const first = verification?.firstCue;
  const last = verification?.lastCue;
  if (cues !== undefined && first !== undefined && last !== undefined) {
    const span = last - first;
    if (span >= MIN_SPAN_SECONDS && cues < FORCED_CUE_CEILING) byDensity = true;
  }

  return { byName, byDensity };
}

/**
 * Whether a candidate should be treated as forced.
 *
 * The name alone is enough, since it is an explicit claim. Density alone is
 * enough too — a 90-minute film with 40 cues is not a dialogue track whatever
 * it calls itself.
 */
export function isForced(signals: ForcedSignals): boolean {
  return signals.byName || signals.byDensity;
}

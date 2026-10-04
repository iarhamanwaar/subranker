/**
 * The oracle: judges whether the addon's top subtitle for a fixture is the
 * correct answer, from signals that need no video — the top result's language,
 * its runtime (last cue vs a single-episode band), and its cue count.
 */
import type { Check, Fixture, OracleResult } from './types.js';

const DEFAULT_MIN = 300; // 5 min

export function runtimeCheck(timeline: number[], fx: Fixture): Check {
  const last = timeline.length ? timeline[timeline.length - 1]! : 0;
  const min = fx.expectedRuntimeMin ?? DEFAULT_MIN;
  const max = fx.expectedRuntimeMax;
  const ok = last >= min && last <= max;
  return {
    name: 'runtime',
    status: ok ? 'pass' : 'fail',
    detail: `last cue ${last.toFixed(0)}s, expected ${min}-${max}s`,
  };
}

// OpenSubtitles returns 3-letter codes (eng/fre/pob). Match on the 2- or
// 3-letter English prefix so "en" and "eng" both pass and "fre" fails.
const EN_CODES = new Set(['en', 'eng']);

export function languageCheck(topLang: string | undefined, fx: Fixture): Check {
  const lang = (topLang ?? '').toLowerCase();
  const ok =
    fx.lang.toLowerCase() === 'en'
      ? EN_CODES.has(lang)
      : lang.startsWith(fx.lang.toLowerCase());
  return {
    name: 'language',
    status: ok ? 'pass' : 'fail',
    detail: `top lang ${topLang ?? '(none)'}, expected ${fx.lang}`,
  };
}

const MIN_CUES = 50;

export function cueSanityCheck(timeline: number[], min = MIN_CUES): Check {
  const ok = timeline.length >= min;
  return {
    name: 'cue-count',
    status: ok ? 'pass' : 'fail',
    detail: `${timeline.length} cues, expected >= ${min}`,
  };
}

export function judge(fx: Fixture, topLang: string | undefined, timeline: number[]): OracleResult {
  const checks: Check[] = [
    languageCheck(topLang, fx),
    runtimeCheck(timeline, fx),
    cueSanityCheck(timeline),
  ];
  return { pass: checks.every((c) => c.status === 'pass'), checks };
}

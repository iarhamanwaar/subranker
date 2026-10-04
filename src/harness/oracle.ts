/**
 * The oracle: judges whether the addon's top subtitle for a fixture is the
 * correct answer, from signals that need no video — the top result's language,
 * its runtime (last cue vs a single-episode band), and its cue count.
 */
import type { Check, Fixture } from './types.js';

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

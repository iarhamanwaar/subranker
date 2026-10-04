/**
 * Types for the offline subtitle test harness.
 *
 * A fixture is one real subtitle request (harvested from production logs) plus
 * what a correct answer looks like. The oracle judges the addon's top result
 * for that request; the runner aggregates judgements into a report.
 */

export interface Fixture {
  label: string; // "Demon Slayer S4E4"
  id: string; // "tt9335498:4:4"
  filename: string; // the played release filename
  videoHash?: string;
  videoSize?: number;
  lang: string; // expected language prefix, e.g. "en"
  expectedRuntimeMax: number; // seconds; upper bound for one episode
  expectedRuntimeMin?: number; // seconds; default 300
}

export type CheckStatus = 'pass' | 'fail';
export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}
export interface OracleResult {
  pass: boolean;
  checks: Check[];
}
export interface EpisodeReport extends OracleResult {
  label: string;
  id: string;
  topLang?: string;
  topUrl?: string;
  runtimeSeconds?: number;
}
export interface HarnessReport {
  total: number;
  passed: number;
  passRate: number;
  episodes: EpisodeReport[];
}

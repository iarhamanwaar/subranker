/**
 * Distribution of verification fetch times, split by outcome.
 *
 * Dead candidates cost the full timeout each, and they are the largest single
 * component of a request. Lowering the timeout reclaims that, but only up to
 * the point where genuinely live files start being cut off — so the question
 * is where the live distribution actually ends, not where it is typical.
 */
import { loadConfig } from '../src/config.js';
import { DEFAULT_FETCH_OPTIONS, fetchAndInspect } from '../src/verify/fetch.js';
import { buildCandidates } from '../src/pipeline.js';
import { scoreAll, rank } from '../src/score/score.js';
import { parseRelease } from '../src/parse/release.js';
import type { RawSubtitle } from '../src/types.js';

const BASES = (process.env.UPSTREAM_BASE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const cfg = loadConfig({ ...process.env, UPSTREAM_BASE: BASES.join(',') });

const TITLES: Array<[string, string]> = [
  ['movie/tt0111161', 'The.Shawshank.Redemption.1994.1080p.BluRay.x264-SiNNERS.mkv'],
  ['movie/tt1375666', 'Inception.2010.1080p.BluRay.x264.YIFY.mp4'],
  ['movie/tt0816692', 'Interstellar.2014.IMAX.1080p.WEB-DL.DD5.1.H264-RARBG.mkv'],
  ['series/tt0903747:1:1', 'Breaking.Bad.S01E01.1080p.BluRay.x265-RARBG.mkv'],
  ['series/tt9335498:1:1', 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv'],
  ['series/tt2560140:1:1', '[Erai-raws] Shingeki no Kyojin - 01 [1080p][Multiple Subtitle].mkv'],
];

// Generous on purpose: the point is to see the true tail, which a production
// timeout would hide by cutting it off.
const PROBE_TIMEOUT = 10000;
const live: number[] = [];
const dead: number[] = [];

for (const [id, filename] of TITLES) {
  const path = `/subtitles/${id}/filename=${encodeURIComponent(filename)}.json`;
  const lists = await Promise.all(BASES.map(async (b) => {
    try {
      const r = await fetch(`${b}${path}`, { signal: AbortSignal.timeout(25000) });
      return ((await r.json()) as { subtitles?: RawSubtitle[] }).subtitles ?? [];
    } catch { return []; }
  }));
  const target = await parseRelease(filename);
  const cands = await buildCandidates(lists.flat());
  const ordered = rank(scoreAll(cands, target, { filename }, { preferSubbed: true, dropMismatches: cfg.dropMismatches }));

  await Promise.all(ordered.slice(0, cfg.verifyLimit).map(async (c) => {
    const t = performance.now();
    const r = await fetchAndInspect(c.raw.url, { ...DEFAULT_FETCH_OPTIONS, timeoutMs: PROBE_TIMEOUT });
    (r.verification.ok ? live : dead).push(performance.now() - t);
  }));
}

const pct = (a: number[], p: number) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]! : NaN;
const show = (label: string, a: number[]) =>
  console.log(`${label.padEnd(8)} n=${String(a.length).padStart(3)}  p50=${pct(a,.5).toFixed(0).padStart(5)}ms  p90=${pct(a,.9).toFixed(0).padStart(5)}ms  p99=${pct(a,.99).toFixed(0).padStart(5)}ms  max=${(a.length?Math.max(...a):NaN).toFixed(0).padStart(5)}ms`);

show('live', live);
show('dead', dead);
console.log(`\ndead share: ${((dead.length / (live.length + dead.length)) * 100).toFixed(1)}%`);
for (const t of [1000, 1500, 2000, 2500]) {
  const lost = live.filter((x) => x > t).length;
  console.log(`timeout ${String(t).padStart(4)}ms -> live files cut off: ${lost}/${live.length} (${((lost/live.length)*100).toFixed(1)}%)`);
}

/**
 * How many live candidates does alignment give up on?
 *
 * Piecewise (ALASS-style) alignment is only worth building if a real
 * population needs it. The files it would recover are the ones that download
 * fine but whose single global (offset, rate) is either untrustworthy or out of
 * bounds — a file cut differently, with an ad break, or missing a scene, cannot
 * be described by one offset no matter how well it is measured.
 *
 * This counts that population instead of assuming it exists.
 */
import { loadConfig } from '../src/config.js';
import { DEFAULT_FETCH_OPTIONS, fetchAndInspect } from '../src/verify/fetch.js';
import { align, isTrustworthy, isAmbiguous } from '../src/verify/cues.js';
import { buildCandidates, consensusTimeline } from '../src/pipeline.js';
import { scoreAll, rank } from '../src/score/score.js';
import { parseRelease } from '../src/parse/release.js';
import { isShiftSafeToApply, isShiftWorthApplying, MAX_APPLY_OFFSET_SECONDS, MIN_APPLY_AGREEMENT } from '../src/shift/rewrite.js';
import type { RawSubtitle } from '../src/types.js';

const BASES = (process.env.UPSTREAM_BASE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const cfg = loadConfig({ ...process.env, UPSTREAM_BASE: BASES.join(',') });

const TITLES: Array<[string, string]> = [
  ['movie/tt0111161', 'The.Shawshank.Redemption.1994.1080p.BluRay.x264-SiNNERS.mkv'],
  ['movie/tt0133093', 'The.Matrix.1999.2160p.UHD.BluRay.x265-TERMiNAL.mkv'],
  ['movie/tt1375666', 'Inception.2010.1080p.BluRay.x264.YIFY.mp4'],
  ['movie/tt0816692', 'Interstellar.2014.IMAX.1080p.WEB-DL.DD5.1.H264-RARBG.mkv'],
  ['movie/tt0110912', 'Pulp.Fiction.1994.REMASTERED.1080p.BluRay.H264-AMIABLE.mkv'],
  ['series/tt0903747:1:1', 'Breaking.Bad.S01E01.1080p.BluRay.x265-RARBG.mkv'],
  ['series/tt0944947:1:1', 'Game.of.Thrones.S01E01.1080p.BluRay.x264-CtrlHD.mkv'],
  ['series/tt1475582:1:1', 'Sherlock.S01E01.A.Study.in.Pink.1080p.BluRay.x264-SHORTBREHD.mkv'],
  ['series/tt9335498:1:1', 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv'],
  ['series/tt2560140:1:1', '[Erai-raws] Shingeki no Kyojin - 01 [1080p][Multiple Subtitle].mkv'],
  ['series/tt0877057:1:1', '[HorribleSubs] Death Note - 01 [1080p].mkv'],
  // The complaint that motivated the ambiguity guard.
  ['series/tt9335498:1:8', 'Demon Slayer - Kimetsu no Yaiba - S01E08 - The Smell of Enchanting Blood Bluray-1080p.mkv'],
  ['series/tt9335498:1:7', 'Demon Slayer - Kimetsu no Yaiba - S01E07 - Muzan Kibutsuji Bluray-1080p.mkv'],
  ['series/tt1528406:1:24', 'Fairy Tail (2009) - S01E24 - To Keep From Seeing Those Tears [Bluray-1080p][Opus 2.0][AV1]-BlackRabbit.mkv'],
];

const shifted: Array<{ title: string; offset: number; agreement: number; ratio: number; ambiguous: boolean }> = [];
let live = 0, noConsensus = 0, untrusted = 0, tooFar = 0, applied = 0, alreadyInSync = 0;
const rejected: Array<{ title: string; offset: number; rate: number; agreement: number }> = [];

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

  const fetched = await Promise.all(ordered.slice(0, cfg.verifyLimit).map(async (c) => ({
    c, r: await fetchAndInspect(c.raw.url, { ...DEFAULT_FETCH_OPTIONS, timeoutMs: cfg.verifyTimeoutMs }),
  })));
  const alive = fetched.filter((f) => f.r.verification.ok);
  const { reference, support } = consensusTimeline(alive.map((f) => f.r.timeline));

  if (support < 0.5) { noConsensus += alive.length; live += alive.length; continue; }

  for (const { r } of alive) {
    live++;
    // The anchor itself is trivially in sync with itself.
    if (r.timeline === reference) { alreadyInSync++; continue; }
    const a = align(r.timeline, reference);
    // A file needing no correction is not a rejection. The first version of
    // this probe counted those as 'out of bounds' because isShiftSafeToApply
    // is false for them too, which inflated the result to 72% and would have
    // justified building a feature for files that are already fine.
    if (!isShiftWorthApplying({ offset: a.offset, rate: a.rate })) {
      alreadyInSync++;
      continue;
    }
    if (!isTrustworthy(a)) {
      untrusted++;
      rejected.push({ title: filename.slice(0, 28), offset: a.offset, rate: a.rate, agreement: a.agreement });
      continue;
    }
    if (!isShiftSafeToApply({ offset: a.offset, rate: a.rate }, a.agreement)) {
      tooFar++;
      rejected.push({ title: filename.slice(0, 28), offset: a.offset, rate: a.rate, agreement: a.agreement });
      continue;
    }
    applied++;
    shifted.push({
      title: filename.slice(0, 28), offset: a.offset, agreement: a.agreement,
      ratio: (a.runnerUp ?? 0) / a.agreement, ambiguous: isAmbiguous(a),
    });
  }
}

console.log(`live candidates checked      ${live}`);
console.log(`  already in sync (no shift)  ${alreadyInSync}`);
console.log(`  no consensus to anchor      ${noConsensus}`);
console.log(`  shift measured + applied    ${applied}`);
console.log(`  rejected: low agreement     ${untrusted}   (< ${MIN_APPLY_AGREEMENT} or < 0.35 trust)`);
console.log(`  rejected: offset too large  ${tooFar}   (> ${MAX_APPLY_OFFSET_SECONDS}s)`);
const recoverable = untrusted + tooFar;
console.log(`\npiecewise would target       ${recoverable}/${live} (${live ? ((recoverable/live)*100).toFixed(1) : '0'}%) of live candidates`);
if (rejected.length) {
  console.log('\nsample rejects (offset / rate / agreement):');
  for (const r of rejected.slice(0, 14)) {
    console.log(`  ${r.title.padEnd(30)} ${r.offset.toFixed(1).padStart(8)}s  rate=${r.rate.toFixed(3)}  agree=${r.agreement.toFixed(2)}`);
  }
}

console.log(`\nshifts the old guard applied: ${shifted.length}; now blocked as ambiguous: ${shifted.filter((x) => x.ambiguous).length}`);
console.log('every applied shift (offset / agreement / runner-up ratio):');
for (const x of shifted.sort((p, q) => q.ratio - p.ratio)) {
  console.log(`  ${x.ambiguous ? 'BLOCK' : 'keep '} ${x.title.padEnd(30)} ${x.offset.toFixed(2).padStart(7)}s  agree=${x.agreement.toFixed(2)}  ratio=${x.ratio.toFixed(2)}`);
}

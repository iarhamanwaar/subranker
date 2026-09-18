/**
 * Why did a candidate get the shift it got?
 *
 * Replays one request through verification and prints, for every live
 * candidate, its first cue, which timeline was chosen as the consensus
 * reference, and the alignment each candidate got against it. Built to explain
 * a real complaint: a correct file served 7.25s early.
 */
import { loadConfig } from '../src/config.js';
import { DEFAULT_FETCH_OPTIONS, fetchAndInspect } from '../src/verify/fetch.js';
import { align } from '../src/verify/cues.js';
import { buildCandidates, consensusTimeline } from '../src/pipeline.js';
import { scoreAll, rank } from '../src/score/score.js';
import { parseRelease } from '../src/parse/release.js';
import type { RawSubtitle } from '../src/types.js';

const BASES = (process.env.UPSTREAM_BASE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const cfg = loadConfig({ ...process.env, UPSTREAM_BASE: BASES.join(',') });
const ID = process.argv[2] ?? 'series/tt9335498:1:8';
const FILE = process.argv[3] ?? 'Demon Slayer - Kimetsu no Yaiba - S01E08 - The Smell of Enchanting Blood Bluray-1080p.mkv';
const path = `/subtitles/${ID}/filename=${encodeURIComponent(FILE)}.json`;

const lists = await Promise.all(BASES.map(async (b) => {
  try {
    const r = await fetch(`${b}${path}`, { signal: AbortSignal.timeout(25000) });
    return ((await r.json()) as { subtitles?: RawSubtitle[] }).subtitles ?? [];
  } catch { return []; }
}));
const target = await parseRelease(FILE);
const ordered = rank(scoreAll(await buildCandidates(lists.flat()), target, { filename: FILE }, { preferSubbed: true, dropMismatches: cfg.dropMismatches }));
const fetched = await Promise.all(ordered.slice(0, cfg.verifyLimit).map(async (c) => ({
  c, r: await fetchAndInspect(c.raw.url, { ...DEFAULT_FETCH_OPTIONS, timeoutMs: cfg.verifyTimeoutMs }),
})));
const alive = fetched.filter((f) => f.r.verification.ok);
const { reference, support } = consensusTimeline(alive.map((f) => f.r.timeline));
console.log(`live=${alive.length}  consensus support=${support.toFixed(2)}\n`);
for (const { c, r } of alive) {
  const t = r.timeline;
  const isRef = t === reference;
  const a = isRef ? null : align(t, reference);
  // Pairwise at rate 1, the same judgement the medoid vote uses.
  const agreesWith = alive.filter((o) => o.r.timeline !== t && align(o.r.timeline, t, { rates: [1], maxOffset: 30 }).agreement >= 0.5).length;
  console.log(
    `${isRef ? 'REF ' : '    '}cues=${String(t.length).padStart(3)} first=${(t[0] ?? 0).toFixed(2).padStart(7)} ` +
    `votes=${agreesWith}/${alive.length - 1} ` +
    (a ? `off=${a.offset.toFixed(2).padStart(6)} rate=${a.rate.toFixed(3)} agree=${a.agreement.toFixed(2)}` : '') +
    `  ${c.releaseText.slice(0, 50)}`,
  );
}

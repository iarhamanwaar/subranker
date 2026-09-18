/**
 * Is readability a usable ranking signal?
 *
 * Broadcast subtitling has objective quality limits — Netflix caps reading
 * speed at 20 characters per second and lines at 42 characters. Nothing in the
 * Stremio ecosystem scores on them. Worth knowing whether real candidates for
 * the same episode actually differ enough for it to separate them, or whether
 * they all sit in the same band and it would rank nothing.
 */
import { loadConfig } from '../src/config.js';
import { buildCandidates } from '../src/pipeline.js';
import { scoreAll, rank } from '../src/score/score.js';
import { parseRelease } from '../src/parse/release.js';
import type { RawSubtitle } from '../src/types.js';

const BASES = (process.env.UPSTREAM_BASE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const cfg = loadConfig({ ...process.env, UPSTREAM_BASE: BASES.join(',') });

const CUE = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})([\s\S]*?)(?=\n\s*\n|\n*$)/g;
const secs = (h: string, m: string, s: string, ms: string) => +h * 3600 + +m * 60 + +s + +ms / 1000;

function stats(text: string) {
  let cues = 0, overCps = 0, overLen = 0, tooShort = 0;
  const cpsAll: number[] = [];
  for (const m of text.matchAll(CUE)) {
    const start = secs(m[1]!, m[2]!, m[3]!, m[4]!);
    const end = secs(m[5]!, m[6]!, m[7]!, m[8]!);
    const body = (m[9] ?? '').replace(/<[^>]+>/g, '').trim();
    if (!body) continue;
    const dur = end - start;
    if (dur <= 0) continue;
    cues++;
    const chars = body.replace(/\s+/g, ' ').length;
    const cps = chars / dur;
    cpsAll.push(cps);
    if (cps > 20) overCps++;                                  // Netflix adult cap
    if (body.split('\n').some((l) => l.length > 42)) overLen++; // Netflix line cap
    if (dur < 0.833) tooShort++;                               // 5/6s minimum
  }
  if (!cues) return null;
  cpsAll.sort((a, b) => a - b);
  return {
    cues,
    medCps: cpsAll[Math.floor(cpsAll.length / 2)]!,
    pctOverCps: (overCps / cues) * 100,
    pctOverLen: (overLen / cues) * 100,
    pctTooShort: (tooShort / cues) * 100,
  };
}

const TITLES: Array<[string, string]> = [
  ['series/tt0903747:1:1', 'Breaking.Bad.S01E01.1080p.BluRay.x265-RARBG.mkv'],
  ['movie/tt1375666', 'Inception.2010.1080p.BluRay.x264.YIFY.mp4'],
];

for (const [id, filename] of TITLES) {
  console.log(`\n=== ${filename}`);
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

  // Fetched here rather than through fetchAndInspect, which does not expose the
  // decoded text. A probe should not require changing production code.
  const rows = await Promise.all(ordered.slice(0, 12).map(async (c, i) => {
    try {
      const r = await fetch(c.raw.url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const st = stats(await r.text());
      return st ? { rank: i + 1, ...st } : null;
    } catch { return null; }
  }));

  console.log('rank  cues  medCPS  >20CPS%  >42char%  <0.83s%');
  for (const r of rows) {
    if (!r) continue;
    console.log(
      `${String(r.rank).padStart(4)} ${String(r.cues).padStart(5)} ${r.medCps.toFixed(1).padStart(7)} ` +
      `${r.pctOverCps.toFixed(1).padStart(8)} ${r.pctOverLen.toFixed(1).padStart(9)} ${r.pctTooShort.toFixed(1).padStart(8)}`
    );
  }
}

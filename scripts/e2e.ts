import { runPipeline } from '../src/pipeline.js';
import type { RawSubtitle } from '../src/types.js';

const BASE = process.env.UPSTREAM_BASE!;
const ID = 'series/tt9335498:1:1';
const FILENAME = 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv';

const cfg = {
  port: 0, upstreamBase: BASE, relabel: true, dropMismatches: true,
  verify: true, verifyLimit: 15, cacheTtl: 0, addonName: 'SubRanker',
};

const res = await fetch(`${BASE}/subtitles/${ID}.json`);
const subs = ((await res.json()) as { subtitles: RawSubtitle[] }).subtitles;

for (const [label, extras] of [
  ['WITHOUT extras (what the TV may send)', {}],
  ['WITH filename', { filename: FILENAME, videoSize: 1144288919 }],
] as const) {
  const t0 = Date.now();
  const out = await runPipeline(subs, extras as any, cfg as any);
  console.log(`\n===== ${label}  (${Date.now() - t0} ms)`);
  console.log(`   received ${out.stats.received}, dropped ${out.stats.dropped}, returned ${out.stats.returned}, verified ${out.stats.verified}`);
  for (const s of out.subtitles.slice(0, 8)) console.log('   ', s.lang);
}

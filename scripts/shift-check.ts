import { runPipeline } from '../src/pipeline.js';
import type { RawSubtitle } from '../src/types.js';

const BASE = process.env.UPSTREAM_BASE!;
const cfg: any = {
  upstreamBase: BASE, relabel: false, dropMismatches: true, verify: true,
  verifyLimit: 15, cacheTtl: 0, addonName: 'x', port: 0, maxResults: 6,
  publicUrl: 'https://subs.bugvi.org', autoShift: true, probeLabels: false,
};
for (const [ep, fn] of [
  ['tt9335498:1:1', 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv'],
  ['tt9335498:1:7', 'Demon Slayer - Kimetsu no Yaiba - S01E07 - Muzan Kibutsuji Bluray-1080p.mkv'],
] as const) {
  const subs = ((await (await fetch(`${BASE}/subtitles/series/${ep}.json`)).json()) as { subtitles: RawSubtitle[] }).subtitles;
  const out = await runPipeline(subs, { filename: fn } as any, cfg);
  console.log(`\n=== ${ep}  (returned ${out.stats.returned})`);
  for (const s of out.subtitles) {
    const m = /\/shift\/([^/]+)\/([^/]+)\//.exec(s.url);
    console.log('   ' + (m ? `SHIFT offset=${m[1]} rate=${m[2]}` : 'original'));
  }
}

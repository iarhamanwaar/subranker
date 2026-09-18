import { runPipeline } from '../src/pipeline.js';
import type { RawSubtitle } from '../src/types.js';
const BASE = process.env.UPSTREAM_BASE!;
const cfg: any = { upstreamBase: BASE, relabel: false, dropMismatches: true, verify: true,
  verifyLimit: 15, cacheTtl: 0, addonName: 'x', port: 0, maxResults: 6,
  publicUrl: 'https://subs.bugvi.org', autoShift: true, probeLabels: false };
for (const [ep, fn] of [
  ['tt9335498:1:1', 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv'],
  ['tt0111161', 'The.Shawshank.Redemption.1994.1080p.BluRay.x264-AMIABLE.mkv'],
] as const) {
  const type = ep.includes(':') ? 'series' : 'movie';
  const subs = ((await (await fetch(`${BASE}/subtitles/${type}/${ep}.json`)).json()) as { subtitles: RawSubtitle[] }).subtitles;
  const out = await runPipeline(subs, { filename: fn } as any, cfg);
  console.log(`\n=== ${ep}`);
  for (const s of out.subtitles) console.log('   ', s.label);
}

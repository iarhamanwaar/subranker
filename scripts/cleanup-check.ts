import { runPipeline } from '../src/pipeline.js';
import type { RawSubtitle } from '../src/types.js';
const BASE = process.env.UPSTREAM_BASE!;
const cfg: any = {
  upstreamBases: BASE.split(','), relabel: false, dropMismatches: true, verify: true,
  verifyLimit: 15, cacheTtl: 0, addonName: 'x', port: 0, maxResults: 6,
  publicUrl: process.env.PUBLIC_URL ?? 'https://example.invalid', autoShift: true,
  probeLabels: false, removeHearingImpaired: true, fixUppercase: true, fixOcr: true,
  demoteForced: true,
};
import { fetchUpstreams } from '../src/upstream/fetch.js';
for (const [type, id, fn] of [
  ['series', 'tt9335498:1:1', 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv'],
  ['movie', 'tt0991346', 'Bhootnath.2008.1080p.BluRay.x264.AAC5.1-[YTS.MX].mp4'],
] as const) {
  const merged = await fetchUpstreams(cfg.upstreamBases, `/subtitles/${type}/${id}.json`);
  const out = await runPipeline(merged.subtitles as RawSubtitle[], { filename: fn } as any, cfg);
  console.log(`\n=== ${id}   received ${out.stats.received} → returned ${out.stats.returned}`);
  for (const s of out.subtitles) {
    const proxied = s.url.includes('/shift/');
    const flags = /\/shift\/[^/]+\/[^/]+\/([a-z0]+)\//.exec(s.url)?.[1] ?? '-';
    console.log(`   ${s.label}   ${proxied ? 'proxied flags=' + flags : 'direct'}`);
  }
}

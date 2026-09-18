/** Where does a subtitle request actually spend its time? */
import { runPipeline } from '../src/pipeline.js';
import { fetchUpstreams } from '../src/upstream/fetch.js';
import type { RawSubtitle } from '../src/types.js';

const BASES = process.env.UPSTREAM_BASE!.split(',');
const cfg: any = {
  upstreamBases: BASES, relabel: false, dropMismatches: true, verify: true,
  verifyLimit: 15, verifyTimeoutMs: 2500, cacheTtl: 0, addonName: 'x', port: 0, maxResults: 6,
  publicUrl: 'https://example.invalid', autoShift: true, probeLabels: false,
  removeHearingImpaired: true, fixUppercase: true, fixOcr: true,
  fixOverlaps: true, demoteForced: true,
};
const CASES = [
  ['series/tt9335498:1:1', 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv'],
  ['series/tt9335498:1:7', 'Demon Slayer - Kimetsu no Yaiba - S01E07 - Muzan Kibutsuji Bluray-1080p.mkv'],
  ['movie/tt0111161', 'The.Shawshank.Redemption.1994.1080p.BluRay.x264-AMIABLE.mkv'],
] as const;

const rows: Array<Record<string, number | string>> = [];
for (const [id, fn] of CASES) {
  const t0 = Date.now();
  const merged = await fetchUpstreams(BASES, `/subtitles/${id}.json`);
  const tUpstream = Date.now() - t0;

  const t1 = Date.now();
  const out = await runPipeline(merged.subtitles as RawSubtitle[], { filename: fn } as any, cfg);
  const tPipeline = Date.now() - t1;

  // Pipeline with verification off isolates the download cost.
  const t2 = Date.now();
  await runPipeline(merged.subtitles as RawSubtitle[], { filename: fn } as any, { ...cfg, verify: false });
  const tNoVerify = Date.now() - t2;

  rows.push({
    case: id, received: merged.subtitles.length, returned: out.stats.returned,
    verified: out.stats.verified,
    upstream_ms: tUpstream, pipeline_ms: tPipeline, parse_score_ms: tNoVerify,
    verify_ms: tPipeline - tNoVerify, total_ms: tUpstream + tPipeline,
  });
}
console.table(rows);

import { runPipeline } from '../src/pipeline.js';
import type { RawSubtitle } from '../src/types.js';

const BASE = process.env.UPSTREAM_BASE!;
const ID = 'series/tt9335498:1:1';
const FILENAME = 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv';

const cfg: any = { upstreamBase: BASE, relabel: false, dropMismatches: true, verify: true, verifyLimit: 15, cacheTtl: 0, addonName: 'x', port: 0 };
const subs = ((await (await fetch(`${BASE}/subtitles/${ID}.json`)).json()) as { subtitles: RawSubtitle[] }).subtitles;

const out = await runPipeline(subs, { filename: FILENAME, videoSize: 1144288919 } as any, cfg);
console.log(`received ${out.stats.received}  dropped ${out.stats.dropped}  returned ${out.stats.returned}  verified ${out.stats.verified}`);
console.log(`target group: ${out.stats.target.group ?? '(none)'}  source: ${out.stats.target.source}`);
console.log('\nTop 8 by id (id encodes the provider):');
out.subtitles.slice(0, 8).forEach((s, i) => console.log(`  ${i + 1}. ${s.id}`));
const pos = out.subtitles.findIndex((s) => /animetosho/i.test(s.id));
console.log(`\nfirst animetosho/fansub entry at position: ${pos === -1 ? 'not present' : pos + 1}`);

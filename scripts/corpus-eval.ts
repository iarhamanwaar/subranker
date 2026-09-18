/**
 * Evaluation across varied content.
 *
 * Nearly every number this project quotes came from one anime episode. That is
 * enough to prove a mechanism works and not enough to claim it generalises, so
 * this runs the same pipeline across movies, live-action TV and anime, in
 * several languages, and reports per-title rather than in aggregate — an
 * average would hide exactly the failures worth finding.
 *
 * Upstreams come from UPSTREAM_BASE. Nothing about any instance is hardcoded.
 */
import { runPipeline } from '../src/pipeline.js';
import { loadConfig } from '../src/config.js';
import type { RawSubtitle } from '../src/types.js';

const BASES = (process.env.UPSTREAM_BASE ?? '')
  .split(',').map((s) => s.trim().replace(/\/manifest\.json$/, '').replace(/\/+$/, ''))
  .filter(Boolean);
if (BASES.length === 0) throw new Error('set UPSTREAM_BASE');

interface Title { kind: string; id: string; name: string; filename: string; }

const TITLES: Title[] = [
  // Movies, mainstream through to non-English.
  { kind: 'movie', id: 'movie/tt0111161', name: 'Shawshank', filename: 'The.Shawshank.Redemption.1994.1080p.BluRay.x264-SiNNERS.mkv' },
  { kind: 'movie', id: 'movie/tt0133093', name: 'The Matrix', filename: 'The.Matrix.1999.2160p.UHD.BluRay.x265-TERMiNAL.mkv' },
  { kind: 'movie', id: 'movie/tt1375666', name: 'Inception', filename: 'Inception.2010.1080p.BluRay.x264.YIFY.mp4' },
  { kind: 'movie', id: 'movie/tt0816692', name: 'Interstellar', filename: 'Interstellar.2014.IMAX.1080p.WEB-DL.DD5.1.H264-RARBG.mkv' },
  { kind: 'movie', id: 'movie/tt6751668', name: 'Parasite (KO)', filename: 'Parasite.2019.1080p.BluRay.x264.KOREAN-VXT.mkv' },
  { kind: 'movie', id: 'movie/tt0110912', name: 'Pulp Fiction', filename: 'Pulp.Fiction.1994.REMASTERED.1080p.BluRay.H264-AMIABLE.mkv' },

  // Live-action TV.
  { kind: 'series', id: 'series/tt0903747:1:1', name: 'Breaking Bad', filename: 'Breaking.Bad.S01E01.1080p.BluRay.x265-RARBG.mkv' },
  { kind: 'series', id: 'series/tt0944947:1:1', name: 'Game of Thrones', filename: 'Game.of.Thrones.S01E01.1080p.BluRay.x264-CtrlHD.mkv' },
  { kind: 'series', id: 'series/tt1475582:1:1', name: 'Sherlock', filename: 'Sherlock.S01E01.A.Study.in.Pink.1080p.BluRay.x264-SHORTBREHD.mkv' },
  { kind: 'series', id: 'series/tt4574334:1:1', name: 'Stranger Things', filename: 'Stranger.Things.S01E01.1080p.NF.WEB-DL.DDP5.1.x264-NTb.mkv' },

  // Anime, including a library-renamed file with no release group.
  { kind: 'anime', id: 'series/tt9335498:1:1', name: 'Demon Slayer', filename: 'Demon Slayer - Kimetsu no Yaiba - S01E01 - Cruelty Bluray-1080p.mkv' },
  { kind: 'anime', id: 'series/tt2560140:1:1', name: 'Attack on Titan', filename: '[Erai-raws] Shingeki no Kyojin - 01 [1080p][Multiple Subtitle].mkv' },
  { kind: 'anime', id: 'series/tt0877057:1:1', name: 'Death Note', filename: '[HorribleSubs] Death Note - 01 [1080p].mkv' },
];

async function fetchUpstream(base: string, id: string, filename: string): Promise<RawSubtitle[]> {
  // filename only. A literal `videoHash=null` is not what a client sends and
  // OpenSubtitles answers it with an empty list, which looks exactly like a
  // pipeline failure until you check the upstream by hand.
  const url = `${base}/subtitles/${id}/filename=${encodeURIComponent(filename)}.json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) return [];
    return ((await r.json()) as { subtitles?: RawSubtitle[] }).subtitles ?? [];
  } catch { return []; }
}

const cfg = { ...loadConfig({ ...process.env, UPSTREAM_BASE: BASES.join(',') }), cacheTtl: 0 };

console.log(`upstreams: ${BASES.length}   titles: ${TITLES.length}\n`);
const header = 'kind    title             recv  drop  ret  ver   ms    rank-1 language';
console.log(header);
console.log('-'.repeat(header.length + 12));

const rows: any[] = [];
for (const t of TITLES) {
  const t0 = Date.now();
  const lists = await Promise.all(BASES.map((b) => fetchUpstream(b, t.id, t.filename)));
  const subs = lists.flat();
  let res;
  try {
    res = await runPipeline(subs, { filename: t.filename }, cfg as any);
  } catch (e) {
    console.log(`${t.kind.padEnd(7)} ${t.name.padEnd(17)} PIPELINE THREW: ${(e as Error).message}`);
    rows.push({ ...t, threw: true });
    continue;
  }
  const ms = Date.now() - t0;
  const s = res.stats;
  const first = res.subtitles[0];
  console.log(
    `${t.kind.padEnd(7)} ${t.name.padEnd(17)} ${String(s.received).padStart(4)} ${String(s.dropped).padStart(5)} ` +
    `${String(s.returned).padStart(4)} ${String(s.verified).padStart(4)} ${String(ms).padStart(6)}  ${(first?.lang ?? '(none)').slice(0, 44)}`
  );
  rows.push({ ...t, ...s, ms, empty: res.subtitles.length === 0 });
}

const ok = rows.filter((r) => !r.threw);
const recv = ok.reduce((a, r) => a + (r.received ?? 0), 0);
const drop = ok.reduce((a, r) => a + (r.dropped ?? 0), 0);
console.log('\n--- summary ---');
console.log(`titles run            ${rows.length}`);
console.log(`pipeline threw        ${rows.filter((r) => r.threw).length}`);
console.log(`returned nothing      ${ok.filter((r) => r.empty).length}`);
console.log(`upstream gave nothing ${ok.filter((r) => r.received === 0).length}`);
console.log(`total received        ${recv}`);
console.log(`dropped as unusable   ${drop}  (${recv ? ((drop / recv) * 100).toFixed(1) : '0'}%)`);
const times = ok.map((r) => r.ms).sort((a, b) => a - b);
if (times.length) console.log(`latency median/max    ${times[Math.floor(times.length / 2)]}ms / ${times[times.length - 1]}ms`);

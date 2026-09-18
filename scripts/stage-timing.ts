/**
 * Where does a slow request actually spend its time?
 *
 * The corpus run showed a 17.5s worst case, which neither upstream latency nor
 * release-name parsing accounts for. This times the pipeline's own stages on a
 * title with a large candidate set.
 */
import { buildCandidates } from '../src/pipeline.js';
import { loadConfig } from '../src/config.js';
import { scoreAll, rank } from '../src/score/score.js';
import { DEFAULT_FETCH_OPTIONS, fetchAndInspect } from '../src/verify/fetch.js';
import { parseRelease } from '../src/parse/release.js';
import type { RawSubtitle } from '../src/types.js';

const BASES = (process.env.UPSTREAM_BASE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const F = 'Inception.2010.1080p.BluRay.x264.YIFY.mp4';
const P = `/subtitles/movie/tt1375666/filename=${encodeURIComponent(F)}.json`;
const cfg = loadConfig({ ...process.env, UPSTREAM_BASE: BASES.join(',') });

const clock = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t = performance.now();
  const r = await fn();
  console.log(`${label.padEnd(28)} ${(performance.now() - t).toFixed(0).padStart(7)}ms`);
  return r;
};

const lists = await clock('upstream fetch (parallel)', async () =>
  Promise.all(BASES.map(async (b) => {
    const r = await fetch(`${b}${P}`, { signal: AbortSignal.timeout(25000) });
    return ((await r.json()) as { subtitles?: RawSubtitle[] }).subtitles ?? [];
  })),
);
const subs = lists.flat();
console.log(`${'candidates received'.padEnd(28)} ${String(subs.length).padStart(7)}`);

const target = await clock('parse target filename', () => parseRelease(F));
const cands = await clock('buildCandidates (parse all)', () => buildCandidates(subs));
const scored = await clock('scoreAll', async () => scoreAll(cands, target, { filename: F }, { preferSubbed: true, dropMismatches: cfg.dropMismatches }));
const ordered = await clock('rank', async () => rank(scored));

console.log(`${'verifyLimit'.padEnd(28)} ${String(cfg.verifyLimit).padStart(7)}`);
console.log(`${'verifyTimeoutMs'.padEnd(28)} ${String(cfg.verifyTimeoutMs).padStart(7)}`);

await clock('verify downloads (parallel)', async () => {
  const top = ordered.slice(0, cfg.verifyLimit);
  const each: string[] = [];
  const out = await Promise.all(top.map(async (c) => {
    const t = performance.now();
    const r = await fetchAndInspect(c.raw.url, { ...DEFAULT_FETCH_OPTIONS, timeoutMs: cfg.verifyTimeoutMs });
    each.push(`${(performance.now() - t).toFixed(0)}ms ${r.verification.ok ? 'ok' : 'dead'}`);
    return r;
  }));
  console.log('   per file:', each.sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 8).join('  '));
  return out;
});

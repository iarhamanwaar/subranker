import { fetchUpstreams } from '../src/upstream/fetch.js';
const BASES = process.env.UPSTREAM_BASE!.split(',');
const merged = await fetchUpstreams(BASES, `/subtitles/${process.env.ID ?? 'series/tt9335498:1:1'}.json`);
const urls = merged.subtitles.slice(0, 15).map((s) => s.url);
const results = await Promise.all(urls.map(async (u) => {
  const t = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    await r.arrayBuffer();
    return { ms: Date.now() - t, status: r.status, host: new URL(u).hostname };
  } catch (e) {
    return { ms: Date.now() - t, status: 'ERR/timeout', host: new URL(u).hostname };
  } finally { clearTimeout(timer); }
}));
results.sort((a, b) => a.ms - b.ms);
for (const r of results) console.log(`  ${String(r.ms).padStart(6)} ms  ${String(r.status).padStart(11)}  ${r.host}`);
const ok = results.filter((r) => typeof r.status === 'number');
const times = ok.map((r) => r.ms).sort((a, b) => a - b);
console.log(`\nsuccessful: ${ok.length}/${results.length}`);
if (times.length) console.log(`median ${times[Math.floor(times.length/2)]} ms, p90 ${times[Math.floor(times.length*0.9)]} ms, max ${times[times.length-1]} ms`);
console.log(`slowest overall (incl. failures): ${results[results.length-1]!.ms} ms`);

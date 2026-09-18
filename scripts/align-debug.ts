import { align, parseTimeline, RATE_CANDIDATES } from '../src/verify/cues.js';

const urls = [
  'https://subsense.nepiraw.com/en/subtitles/series/tt9335498:1:1.json',
];
const list = (await (await fetch(urls[0]!)).json()) as { subtitles: { id: string; url: string }[] };
const picks = list.subtitles.slice(0, 6);

const timelines: { id: string; t: number[] }[] = [];
for (const p of picks) {
  try {
    const r = await fetch(p.url);
    if (!r.ok) { console.log(`skip ${p.id} HTTP ${r.status}`); continue; }
    const t = parseTimeline(await r.text());
    if (t.length > 5) timelines.push({ id: p.id.slice(0, 34), t });
  } catch { /* ignore */ }
}

console.log(`\n${timelines.length} usable timelines`);
for (const x of timelines) {
  console.log(`  ${x.id.padEnd(34)} cues=${String(x.t.length).padStart(4)}  first=${x.t[0]!.toFixed(2)}  last=${x.t[x.t.length - 1]!.toFixed(1)}`);
}

const ref = timelines[0]!;
console.log(`\nAligning each against ${ref.id}:`);
for (const x of timelines) {
  const a = align(x.t, ref.t);
  console.log(`  ${x.id.padEnd(34)} offset=${a.offset.toFixed(2).padStart(8)}  rate=${a.rate.toFixed(4)}  agreement=${a.agreement.toFixed(3)}`);
}

// What does the identity hypothesis actually score?
console.log('\nIdentity check (rate=1, offset=0) vs chosen, for each:');
for (const x of timelines) {
  const tol = 0.35;
  const hits = x.t.filter((t) => ref.t.some((r) => Math.abs(r - t) < tol)).length;
  console.log(`  ${x.id.padEnd(34)} identity-agreement=${(hits / Math.min(x.t.length, ref.t.length)).toFixed(3)}`);
}

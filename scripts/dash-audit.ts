import { decodeSubtitle } from '../src/shift/encoding.js';
import { fetchUpstreams } from '../src/upstream/fetch.js';
const BASE = process.env.UPSTREAM_BASE!;
let withSpace = 0, withoutSpace = 0, files = 0;
for (const id of ['series/tt9335498:1:1', 'series/tt9335498:1:7', 'movie/tt0111161', 'movie/tt0991346']) {
  const merged = await fetchUpstreams(BASE.split(','), `/subtitles/${id}.json`);
  for (const s of merged.subtitles.slice(0, 5)) {
    let text: string;
    try { const r = await fetch(s.url); if (!r.ok) continue; text = decodeSubtitle(Buffer.from(await r.arrayBuffer())).text; } catch { continue; }
    const ws = (text.match(/^-\s+\S/gm) || []).length;
    const ns = (text.match(/^-\S/gm) || []).length;
    if (ws + ns === 0) continue;
    files++; withSpace += ws; withoutSpace += ns;
    console.log(`${s.id.slice(0,42).padEnd(42)} "- x": ${String(ws).padStart(3)}   "-x": ${String(ns).padStart(3)}`);
  }
}
console.log(`\nfiles with dashed dialogue: ${files}`);
console.log(`total "- " (with space): ${withSpace}`);
console.log(`total "-"  (no space)  : ${withoutSpace}`);

import { decodeSubtitle } from '../src/shift/encoding.js';
import { fixOverlaps, parseCues, countOverlaps } from '../src/shift/overlap.js';
import { fetchUpstreams } from '../src/upstream/fetch.js';
const BASE = process.env.UPSTREAM_BASE!;
const merged = await fetchUpstreams(BASE.split(','), `/subtitles/${process.env.ID!}.json`);
for (const s of merged.subtitles.slice(0, 3)) {
  let text: string;
  try { const r = await fetch(s.url); if (!r.ok) continue; text = decodeSubtitle(Buffer.from(await r.arrayBuffer())).text; } catch { continue; }
  const before = parseCues(text); if (!before) continue;
  if (countOverlaps(before) === 0) continue;

  const sorted = [...before].sort((a, b) => a.start - b.start);
  console.log(`\n### ${s.id.slice(0, 44)}`);
  console.log('BEFORE (overlapping pairs):');
  const marks: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.start < sorted[i - 1]!.end - 0.05) {
      marks.push(sorted[i]!.start);
      console.log(`   ${sorted[i-1]!.start.toFixed(2)}-${sorted[i-1]!.end.toFixed(2)}  ${JSON.stringify(sorted[i-1]!.text)}`);
      console.log(`   ${sorted[i]!.start.toFixed(2)}-${sorted[i]!.end.toFixed(2)}  ${JSON.stringify(sorted[i]!.text)}`);
    }
  }
  const after = parseCues(fixOverlaps(text).content)!;
  console.log('AFTER (same moments):');
  for (const m of marks.slice(0, 4)) {
    for (const c of after) {
      if (c.start <= m + 0.01 && c.end >= m + 0.01 && c.text.includes('\n')) {
        console.log(`   ${c.start.toFixed(2)}-${c.end.toFixed(2)}  ${JSON.stringify(c.text)}`);
        break;
      }
    }
  }
  break;
}

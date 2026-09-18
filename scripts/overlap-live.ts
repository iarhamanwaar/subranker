import { decodeSubtitle } from '../src/shift/encoding.js';
import { fixOverlaps, parseCues, countOverlaps } from '../src/shift/overlap.js';
import { fetchUpstreams } from '../src/upstream/fetch.js';
const BASE = process.env.UPSTREAM_BASE!;
const merged = await fetchUpstreams(BASE.split(','), `/subtitles/${process.env.ID ?? 'series/tt9335498:1:7'}.json`);
for (const s of merged.subtitles.slice(0, 4)) {
  let text: string;
  try {
    const r = await fetch(s.url); if (!r.ok) continue;
    text = decodeSubtitle(Buffer.from(await r.arrayBuffer())).text;
  } catch { continue; }
  const before = parseCues(text); if (!before || before.length < 20) continue;
  const b = countOverlaps(before);
  const out = fixOverlaps(text);
  const after = countOverlaps(parseCues(out.content)!);
  console.log(`${s.id.slice(0,44).padEnd(44)} overlaps ${b} -> ${after}   cues ${before.length} -> ${parseCues(out.content)!.length}`);
  if (b > 0) {
    const sample = out.content.split(/\n\s*\n/).find((blk) => blk.includes('\n- ') || (blk.split('\n').length > 3));
    if (sample) console.log('   sample merged cue:\n' + sample.split('\n').map((l) => '      ' + l).join('\n'));
  }
}

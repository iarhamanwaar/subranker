import { stripHearingImpaired } from '../src/shift/cleanup.js';
import { decodeSubtitle } from '../src/shift/encoding.js';
import { fetchUpstreams } from '../src/upstream/fetch.js';

const BASE = process.env.UPSTREAM_BASE!;
const merged = await fetchUpstreams(BASE.split(','), '/subtitles/series/tt9335498:1:1.json');
let shown = 0;
for (const s of merged.subtitles.slice(0, 6)) {
  let buf: Buffer;
  try {
    const r = await fetch(s.url);
    if (!r.ok) continue;
    buf = Buffer.from(await r.arrayBuffer());
  } catch { continue; }
  const { text } = decodeSubtitle(buf);
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const changes: string[] = [];
  for (const b of blocks) {
    const body = b.split('\n').filter((l) => !/-->/.test(l) && !/^\s*\d+\s*$/.test(l) && !/^\s*WEBVTT/.test(l)).join('\n');
    if (!body.trim()) continue;
    const out = stripHearingImpaired(body);
    if (out !== body) changes.push(`${JSON.stringify(body).slice(0, 60)}  ->  ${out === null ? 'DROPPED' : JSON.stringify(out).slice(0, 50)}`);
  }
  if (changes.length === 0) continue;
  console.log(`\n=== ${s.id.slice(0, 44)}   ${changes.length} cues affected`);
  for (const c of changes.slice(0, 8)) console.log('   ', c);
  if (++shown >= 3) break;
}

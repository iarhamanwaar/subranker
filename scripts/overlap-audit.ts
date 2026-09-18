import { decodeSubtitle } from '../src/shift/encoding.js';
import { fetchUpstreams } from '../src/upstream/fetch.js';

const BASE = process.env.UPSTREAM_BASE!;
const ID = process.env.ID ?? 'series/tt9335498:1:1';
const merged = await fetchUpstreams(BASE.split(','), `/subtitles/${ID}.json`);

interface Cue { start: number; end: number; text: string }
function parse(t: string): Cue[] {
  const out: Cue[] = [];
  for (const b of t.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const m = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(b);
    if (!m) continue;
    const s = +m[1]! * 3600 + +m[2]! * 60 + +m[3]! + +m[4]!.padEnd(3, '0') / 1000;
    const e = +m[5]! * 3600 + +m[6]! * 60 + +m[7]! + +m[8]!.padEnd(3, '0') / 1000;
    const text = b.split('\n').filter((l) => !/-->/.test(l) && !/^\s*\d+\s*$/.test(l) && !/^\s*WEBVTT/.test(l)).join(' | ');
    out.push({ start: s, end: e, text });
  }
  return out.sort((a, b) => a.start - b.start);
}

let checked = 0;
for (const s of merged.subtitles.slice(0, 8)) {
  let text: string;
  try {
    const r = await fetch(s.url);
    if (!r.ok) continue;
    text = decodeSubtitle(Buffer.from(await r.arrayBuffer())).text;
  } catch { continue; }
  const cues = parse(text);
  if (cues.length < 20) continue;
  const overlaps: string[] = [];
  for (let i = 1; i < cues.length; i++) {
    const prev = cues[i - 1]!, cur = cues[i]!;
    if (cur.start < prev.end - 0.05) {
      overlaps.push(`${prev.start.toFixed(2)}-${prev.end.toFixed(2)} "${prev.text.slice(0, 32)}"  ||  ${cur.start.toFixed(2)}-${cur.end.toFixed(2)} "${cur.text.slice(0, 32)}"`);
    }
  }
  console.log(`\n=== ${s.id.slice(0, 46)}  cues=${cues.length}  OVERLAPS=${overlaps.length}`);
  for (const o of overlaps.slice(0, 5)) console.log('   ', o);
  if (++checked >= 4) break;
}

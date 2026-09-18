/**
 * Overlapping-cue repair.
 *
 * When two cues are on screen at once — a sign and a line of dialogue, or two
 * characters speaking together — a player that draws both in the same place
 * renders them on top of each other and neither can be read.
 *
 * The cause is usually a conversion: in ASS the sign carries a `\pos` tag that
 * puts it at the top of the frame, and converting to SRT throws the
 * positioning away, leaving two cues competing for the same line.
 *
 * Measured on Demon Slayer: one provider's files overlap on every episode
 * checked (1, 4, 2, 7 and 3 occurrences on S01E01/02/06/07/12), while every
 * other source was clean — so this is a property of the file, not the player.
 *
 * The fix is to make the timeline non-overlapping by splitting it at every
 * boundary and combining the text of whatever is active in each span. Nothing
 * is discarded: both lines appear, stacked, for exactly the period they were
 * both meant to be visible.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Ignore overlaps shorter than this; they are rounding, not collisions. */
const MIN_OVERLAP_SECONDS = 0.05;

/**
 * Whether a line reads as spoken dialogue rather than on-screen text.
 *
 * Signs and titles are typically set in capitals (`DESTROY DEMONS`), while
 * dialogue carries ordinary sentence case. The distinction matters because
 * simultaneous *speech* has a presentation convention that a sign must not be
 * dragged into.
 */
function looksLikeDialogue(line: string): boolean {
  const bare = line.replace(/<[^>]+>/g, '').trim();
  if (!bare) return false;
  if (/^[-–—♪♫]/.test(bare)) return false; // already marked, or a lyric
  return /[a-z]/.test(bare);
}

/**
 * Mark simultaneous speakers the way subtitles conventionally do.
 *
 * When two people talk at once, broadcast practice is one line each prefixed
 * with a dash:
 *
 *     - Get back!
 *     - I can't!
 *
 * Without it the two lines read as one run-on sentence. Applied only when
 * every line looks like dialogue, so a sign stacked above a line of speech is
 * left as plain text.
 */
function markSpeakers(lines: string[]): string[] {
  if (lines.length < 2) return lines;
  if (!lines.every(looksLikeDialogue)) return lines;
  return lines.map((l) => `- ${l.trim()}`);
}

export function countOverlaps(cues: Cue[]): number {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  let n = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.start < sorted[i - 1]!.end - MIN_OVERLAP_SECONDS) n += 1;
  }
  return n;
}

/**
 * Rewrite a cue list so no two cues are on screen at the same time.
 *
 * Spans where several cues are active become a single cue carrying each text
 * on its own line, in the order the cues began. Adjacent spans with identical
 * text are merged back together so a long cue interrupted by a short one does
 * not come out fragmented.
 */
export function mergeOverlaps(cues: Cue[]): Cue[] {
  if (cues.length < 2) return cues;

  const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
  if (countOverlaps(sorted) === 0) return sorted;

  const boundaries = new Set<number>();
  for (const c of sorted) {
    boundaries.add(c.start);
    boundaries.add(c.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);

  const spans: Cue[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    if (to - from <= 0) continue;

    const active = sorted.filter((c) => c.start <= from && c.end >= to);
    if (active.length === 0) continue;

    // De-duplicate identical lines so a repeated cue does not print twice.
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const c of active) {
      const t = c.text.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      lines.push(t);
    }
    if (lines.length === 0) continue;

    spans.push({ start: from, end: to, text: markSpeakers(lines).join('\n') });
  }

  // Re-join neighbouring spans that ended up with the same text.
  const out: Cue[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && last.text === span.text && Math.abs(last.end - span.start) < 0.001) {
      last.end = span.end;
      continue;
    }
    out.push({ ...span });
  }
  return out;
}

/** Parse SRT/VTT into cues. Returns null for ASS, which is left alone. */
export function parseCues(content: string): Cue[] | null {
  if (/^\s*Dialogue:/m.test(content)) return null;
  const out: Cue[] = [];
  for (const block of content.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const m =
      /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(block);
    if (!m) continue;
    const start =
      Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000;
    const end =
      Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]!.padEnd(3, '0')) / 1000;
    const text = block
      .split('\n')
      .filter((l) => !/-->/.test(l) && !/^\s*\d+\s*$/.test(l) && !/^\s*WEBVTT/.test(l))
      .join('\n')
      .trim();
    if (text) out.push({ start, end, text });
  }
  return out;
}

function fmt(seconds: number, vtt: boolean): string {
  const s = seconds < 0 ? 0 : seconds;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}${vtt ? '.' : ','}${pad(ms, 3)}`;
}

export function renderCues(cues: Cue[], vtt: boolean): string {
  const head = vtt ? 'WEBVTT\n\n' : '';
  return (
    head +
    cues
      .map((c, i) => `${vtt ? '' : `${i + 1}\n`}${fmt(c.start, vtt)} --> ${fmt(c.end, vtt)}\n${c.text}`)
      .join('\n\n') +
    '\n'
  );
}

/**
 * Repair overlapping cues in an SRT or VTT file.
 *
 * ASS is returned untouched: its cues carry their own positioning, so an
 * overlap there is deliberate typesetting rather than a fault.
 */
export function fixOverlaps(content: string): { content: string; merged: number } {
  const cues = parseCues(content);
  if (cues === null || cues.length < 2) return { content, merged: 0 };
  const before = countOverlaps(cues);
  if (before === 0) return { content, merged: 0 };
  const vtt = /^\s*WEBVTT/.test(content);
  return { content: renderCues(mergeOverlaps(cues), vtt), merged: before };
}

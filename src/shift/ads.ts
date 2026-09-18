/**
 * Advertising-cue removal.
 *
 * Subtitle providers inject promotional cues into the files they serve.
 * OpenSubtitles V3+ adds one at 00:00:01 (`>>OpenSubtitles v3+ v0.0.4<<`) and
 * osdb.link banners appear as the first cue of downloads. They are not part of
 * the film, they anchor alignment to a line that is not in the video, and they
 * are the first thing on screen when playback starts.
 *
 * Detection is deliberately conservative: a cue is removed only when it matches
 * a known promotional pattern AND sits in the first or last moments of the
 * file, so real dialogue mentioning a website is never dropped.
 */

/** Seconds from the start/end within which a promo cue is plausible. */
const EDGE_WINDOW_SECONDS = 90;

const AD_PATTERNS: RegExp[] = [
  /opensubtitles/i,
  /osdb\.link/i,
  /subscene/i,
  /subdl\.com/i,
  /addic7ed/i,
  /yifysubtitles/i,
  /\bsubtitles?\s+(by|from|downloaded)\b/i,
  /watch\s+online\s+movies/i,
  /\bapi\.OpenSubtitles\.org\b/i,
  /support\s+us\s+and\s+become/i,
  /advertise\s+your\s+product/i,
  /\bwww\.[a-z0-9-]+\.(com|net|org|link|io)\b/i,
  /premium\s+member/i,
  /\bencoded?\s+by\b/i,
  /\bsync(hroni[sz]ed)?\s+(and\s+)?correct(ed|ions)?\s+by\b/i,
];

export function looksLikeAd(text: string): boolean {
  const t = text.replace(/<[^>]+>/g, ' ').trim();
  if (!t) return false;
  return AD_PATTERNS.some((re) => re.test(t));
}

interface Block {
  raw: string;
  start: number | null;
  text: string;
}

function parseTime(v: string): number {
  const m = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(v);
  if (!m) return 0;
  return (
    Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000
  );
}

/**
 * Strip promotional cues from an SRT or VTT file.
 *
 * Cue numbering is rebuilt afterwards, since players can behave oddly with
 * gaps in the sequence. ASS files are returned untouched — their promo lines
 * are rarer and the format carries styling that is riskier to rewrite.
 */
export function stripAds(content: string): { content: string; removed: number } {
  if (/^\s*Dialogue:/m.test(content)) return { content, removed: 0 };

  const normalised = content.replace(/\r\n/g, '\n');
  const isVtt = /^\s*WEBVTT/.test(normalised);
  const chunks = normalised.split(/\n\s*\n/);

  const blocks: Block[] = chunks.map((raw) => {
    const arrow = /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->/.exec(raw);
    const text = raw
      .split('\n')
      .filter((l) => !/-->/.test(l) && !/^\s*\d+\s*$/.test(l) && !/^\s*WEBVTT/.test(l))
      .join(' ');
    return { raw, start: arrow ? parseTime(arrow[1]!) : null, text };
  });

  const lastStart = blocks.reduce((max, b) => (b.start !== null && b.start > max ? b.start : max), 0);

  let removed = 0;
  const kept = blocks.filter((b) => {
    if (b.start === null) return true; // headers and stray chunks
    const nearEdge = b.start <= EDGE_WINDOW_SECONDS || b.start >= lastStart - EDGE_WINDOW_SECONDS;
    if (nearEdge && looksLikeAd(b.text)) {
      removed += 1;
      return false;
    }
    return true;
  });

  if (removed === 0) return { content, removed: 0 };

  // Renumber SRT cues so the sequence stays contiguous.
  let n = 0;
  const rebuilt = kept
    .map((b) => {
      if (b.start === null) return b.raw.trim();
      const lines = b.raw.split('\n').filter((l) => !/^\s*\d+\s*$/.test(l) || /-->/.test(l));
      n += 1;
      return isVtt ? lines.join('\n').trim() : `${n}\n${lines.join('\n').trim()}`;
    })
    .filter((s) => s.length > 0);

  return { content: rebuilt.join('\n\n') + '\n', removed };
}

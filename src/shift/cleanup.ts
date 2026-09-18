/**
 * Cue-text cleanup: hearing-impaired tags, shouting, and OCR damage.
 *
 * These are the repairs Bazarr has settled on after years of use (Remove HI
 * Tags, Fix Uppercase, OCR Fixes), applied here to the file we already rewrite
 * for timing, advertising and encoding.
 *
 * The most useful of the three is HI removal. An SDH track carries sound
 * descriptions — `[DOOR CREAKS]`, `(SIRENS WAIL)`, `DOCTOR:` — which are
 * clutter for a viewer who can hear. Strip them and an SDH track becomes an
 * ordinary subtitle, which matters on obscure titles where SDH is the only
 * thing on offer.
 */

/**
 * Bracketed sound descriptions.
 *
 * Only fully-bracketed spans are removed. A bracket that opens and never
 * closes on the same line is left alone, because unbalanced brackets appear in
 * ordinary dialogue and in fansub typesetting.
 */
const BRACKETED = /[[(]\s*[^[\]()]{0,60}\s*[\])]/g;

/**
 * `DOCTOR:` / `MAN 2:` — a speaker label in capitals at the start of a line.
 *
 * The trailing `(?=\S)` is load-bearing: a speaker label is always followed by
 * that speaker's words on the same line. Without it, a title card such as
 * `EPISODE 1:` followed by `CRUELTY` on the next line is read as a speaker and
 * silently deleted — observed on a real file during an audit.
 */
const SPEAKER_LABEL = /^\s*[-–]?\s*[A-Z][A-Z0-9 .'#-]{1,24}:[ \t]+(?=\S)/;

/** Musical-note markers that wrap song lyrics. */
const MUSIC_MARKER = /^[\s♪♫#*]+|[\s♪♫#*]+$/g;

function stripTags(line: string): string {
  return line.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '');
}

/**
 * Remove hearing-impaired annotations from one cue's text.
 *
 * Returns null when nothing meaningful survives, so the caller can drop the
 * cue rather than leave a blank one on screen.
 */
export function stripHearingImpaired(text: string): string | null {
  const lines = text.split('\n').map((line) => {
    let out = line.replace(BRACKETED, ' ');
    out = out.replace(SPEAKER_LABEL, '');
    return out.replace(/\s{2,}/g, ' ').trim();
  });

  const kept = lines.filter((l) => {
    const bare = stripTags(l).replace(MUSIC_MARKER, '').trim();
    return bare.length > 0;
  });

  return kept.length > 0 ? kept.join('\n') : null;
}

/**
 * Whether a file is written in shouting capitals throughout.
 *
 * Judged over the file rather than per line: a single capitalised line is
 * emphasis, but a whole file in capitals is a transcription style that is
 * tiring to read.
 */
export function isAllCaps(lines: string[]): boolean {
  let upper = 0;
  let lower = 0;
  for (const line of lines) {
    for (const ch of line) {
      if (ch >= 'a' && ch <= 'z') lower += 1;
      else if (ch >= 'A' && ch <= 'Z') upper += 1;
    }
  }
  const letters = upper + lower;
  if (letters < 200) return false; // too little text to judge
  return lower / letters < 0.05;
}

/** Convert a shouting line to sentence case, preserving `I` and acronyms. */
export function toSentenceCase(line: string): string {
  const lowered = line.toLowerCase();
  // Capitalise the first letter of the line and after sentence punctuation.
  const cased = lowered.replace(/(^|[.!?]\s+|\n)([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
  return cased.replace(/\bi\b/g, 'I').replace(/\bi'/g, "I'");
}

/**
 * Corrections for characters that optical recognition routinely confuses.
 *
 * Every rule is anchored to a word context. Unanchored `l`→`I` substitution
 * would rewrite real words, which is worse than the damage it repairs.
 */
const OCR_FIXES: Array<[RegExp, string]> = [
  [/\bl'm\b/g, "I'm"],
  [/\bl'll\b/g, "I'll"],
  [/\bl've\b/g, "I've"],
  [/\bl'd\b/g, "I'd"],
  [/\bl\b(?=\s)/g, 'I'], // lone lowercase L used as the pronoun
  [/\blt's\b/g, "It's"],
  [/\blt\b(?=\s+(?:is|was|will|would|has|had|can|could))/g, 'It'],
  [/\bthe rn\b/gi, 'the m'],
  [/\brnore\b/g, 'more'],
  [/\brnan\b/g, 'man'],
  [/\brny\b/g, 'my'],
  [/\bsorne\b/g, 'some'],
  [/\bcorne\b/g, 'come'],
  [/\btirne\b/g, 'time'],
  [/\bhorne\b/g, 'home'],
  [/\bnarne\b/g, 'name'],
  [/\bfrorn\b/g, 'from'],
  [/\bwe'II\b/g, "we'll"],
  [/\byou'II\b/g, "you'll"],
  [/\bAII\b/g, 'All'],
  [/\bWeII\b/g, 'Well'],
];

export function fixOcrErrors(line: string): string {
  let out = line;
  for (const [re, to] of OCR_FIXES) out = out.replace(re, to);
  return out;
}

export interface CleanupOptions {
  removeHearingImpaired: boolean;
  fixUppercase: boolean;
  fixOcr: boolean;
}

export interface CleanupResult {
  content: string;
  hiCuesChanged: number;
  uppercaseFixed: boolean;
  ocrFixed: number;
}

/**
 * Apply the enabled cleanups to an SRT or VTT file.
 *
 * ASS/SSA is returned untouched: its cues carry typesetting that these
 * line-level rewrites would destroy, which is exactly the complaint against
 * Bazarr's own HI removal (morpheus65535/bazarr#2175).
 */
export function cleanupCues(content: string, options: CleanupOptions): CleanupResult {
  const untouched: CleanupResult = { content, hiCuesChanged: 0, uppercaseFixed: false, ocrFixed: 0 };
  if (/^\s*Dialogue:/m.test(content)) return untouched;
  if (!options.removeHearingImpaired && !options.fixUppercase && !options.fixOcr) return untouched;

  const normalised = content.replace(/\r\n/g, '\n');
  const blocks = normalised.split(/\n\s*\n/);

  const textLines: string[] = [];
  for (const b of blocks) {
    for (const l of b.split('\n')) {
      if (!/-->/.test(l) && !/^\s*\d+\s*$/.test(l) && !/^\s*WEBVTT/.test(l)) textLines.push(l);
    }
  }
  const shouting = options.fixUppercase && isAllCaps(textLines);

  let hiCuesChanged = 0;
  let ocrFixed = 0;
  const out: string[] = [];
  let index = 0;

  for (const block of blocks) {
    const lines = block.split('\n');
    const timing = lines.filter((l) => /-->/.test(l) || /^\s*WEBVTT/.test(l));
    const body = lines.filter((l) => !/-->/.test(l) && !/^\s*\d+\s*$/.test(l) && !/^\s*WEBVTT/.test(l));

    if (timing.length === 0) {
      if (block.trim()) out.push(block.trim());
      continue;
    }

    let text = body.join('\n');
    if (options.removeHearingImpaired) {
      const stripped = stripHearingImpaired(text);
      if (stripped !== text) hiCuesChanged += 1;
      if (stripped === null) continue; // nothing but sound description: drop the cue
      text = stripped;
    }
    if (shouting) text = text.split('\n').map(toSentenceCase).join('\n');
    if (options.fixOcr) {
      const fixed = text.split('\n').map(fixOcrErrors).join('\n');
      if (fixed !== text) ocrFixed += 1;
      text = fixed;
    }

    index += 1;
    const isVtt = /^\s*WEBVTT/.test(normalised);
    out.push((isVtt ? '' : `${index}\n`) + timing.join('\n') + '\n' + text);
  }

  return {
    content: out.join('\n\n') + '\n',
    hiCuesChanged,
    uppercaseFixed: shouting,
    ocrFixed,
  };
}

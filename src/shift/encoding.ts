/**
 * Character-encoding repair.
 *
 * Measured on this setup: 3 of 22 subtitle files sampled from the upstream were
 * not valid UTF-8. They render as mojibake — `café` as `cafÃ©`, Japanese as
 * `ã‚ãŒã¦` — which reads as a bad subtitle rather than a broken one, so the
 * viewer blames the translation and picks another file.
 *
 * Two distinct faults are handled:
 *
 *  1. **Legacy encodings.** The file was saved as Windows-1252, Shift_JIS,
 *     CP1256 and so on, and the player assumes UTF-8.
 *  2. **Double encoding.** The file *is* valid UTF-8, but its text was already
 *     mangled upstream — UTF-8 bytes were decoded as Latin-1 and re-encoded.
 *     Valid UTF-8 is not the same as correct text.
 */

/**
 * Legacy encodings worth trying, most likely first.
 *
 * Windows-1252 leads because it is the default of the Windows tooling most
 * subtitles are authored with. The Asian encodings matter for fansubs.
 */
const CANDIDATE_ENCODINGS = [
  'windows-1252',
  'windows-1251', // Cyrillic
  'windows-1256', // Arabic
  'shift_jis',
  'euc-kr',
  'gb18030',
  'big5',
  'iso-8859-7', // Greek
  'windows-1254', // Turkish
] as const;

export interface DecodeResult {
  text: string;
  /** The encoding the bytes were interpreted as. */
  encoding: string;
  /** True when anything had to be repaired. */
  repaired: boolean;
}

/** Signature of UTF-8 that was decoded as Latin-1 somewhere upstream. */
const MOJIBAKE_RE = /Ã[\x80-\xbf]|â€[\x80-\xbf™]|Â[\xa0-\xbf]|ï¿½/;

function stripBom(buf: Buffer): Buffer {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3);
  return buf;
}

function isValidUtf8(buf: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Score decoded text for plausibility. Lower is better.
 *
 * Any legacy encoding will *produce* output for any byte sequence, so the
 * question is never "did it decode" but "does the result look like language".
 */
function implausibility(text: string): number {
  let score = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd) score += 10; // replacement character
    else if (c < 0x09) score += 5; // control characters
    else if (c >= 0x80 && c <= 0x9f) score += 3; // C1 range, rare in real text
  }
  if (MOJIBAKE_RE.test(text)) score += 50;
  return score;
}

/**
 * Windows-1252's 0x80–0x9F block, which Latin-1 leaves undefined.
 *
 * The mangling nearly always happens through Windows-1252 rather than Latin-1,
 * and that is where the difference shows: `don’t` becomes `donâ€™t`, whose `€`
 * (U+20AC) and `™` (U+2122) are above U+00FF and cannot be expressed in
 * Latin-1 at all. Reversing with Latin-1 silently truncates them and the
 * repair fails.
 */
const CP1252_HIGH: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a,
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c,
  'ž': 0x9e, 'Ÿ': 0x9f,
};

/** Re-encode text as Windows-1252 bytes, or fail if a character cannot be. */
function toCp1252(text: string): Buffer | null {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff) {
      out.push(code);
      continue;
    }
    const mapped = CP1252_HIGH[ch];
    if (mapped === undefined) return null;
    out.push(mapped);
  }
  return Buffer.from(out);
}

/**
 * Undo double encoding: re-encode the text as Windows-1252 and read it as UTF-8.
 *
 * Only kept when the result is actually more plausible, since the same
 * operation applied to correct text would destroy it.
 */
function repairDoubleEncoding(text: string): string | null {
  try {
    const bytes = toCp1252(text);
    if (bytes === null || !isValidUtf8(bytes)) return null;
    const fixed = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return implausibility(fixed) < implausibility(text) ? fixed : null;
  } catch {
    return null;
  }
}

/**
 * Decode subtitle bytes to correct text, repairing encoding faults.
 */
export function decodeSubtitle(buf: Buffer): DecodeResult {
  const body = stripBom(buf);

  if (isValidUtf8(body)) {
    const text = new TextDecoder('utf-8').decode(body);
    if (MOJIBAKE_RE.test(text)) {
      const fixed = repairDoubleEncoding(text);
      if (fixed !== null) return { text: fixed, encoding: 'utf-8 (double-encoded)', repaired: true };
    }
    return { text, encoding: 'utf-8', repaired: false };
  }

  let best: DecodeResult | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const enc of CANDIDATE_ENCODINGS) {
    let text: string;
    try {
      text = new TextDecoder(enc).decode(body);
    } catch {
      continue; // encoding unavailable in this runtime's ICU build
    }
    const score = implausibility(text);
    if (score < bestScore) {
      bestScore = score;
      best = { text, encoding: enc, repaired: true };
    }
  }

  // Last resort: lossy UTF-8 rather than failing the request outright.
  return best ?? { text: new TextDecoder('utf-8').decode(body), encoding: 'utf-8 (lossy)', repaired: true };
}

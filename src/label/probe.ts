/**
 * Label-format probe.
 *
 * Stremio's subtitle object exposes only `id`, `url` and `lang`, and clients
 * disagree about what they do with `lang`. The Android TV client maps it
 * through a language dictionary and renders an *empty row* for anything it does
 * not recognise, so a descriptive string silently disappears. Other clients
 * appear to print it verbatim.
 *
 * Rather than guess, this returns the same subtitle once per candidate format.
 * Whichever rows appear in your client's picker are the formats that client
 * will render, which tells you what `RELABEL` can safely produce.
 */
import type { RawSubtitle } from '../types.js';

/**
 * Candidate formats, ordered so the position in the list identifies which one
 * rendered even when the text itself is swallowed.
 */
export const PROBE_FORMATS: string[] = [
  'eng', // control: the standard ISO 639-2 code
  'English', // control: the full name
  // AIOStreams' own error entries use this shape (`transformers/stremio.ts`
  // emits `[❌] <title> - <description>`), so it is the existence proof that
  // some descriptive strings do reach the screen.
  '[❌] Erai-raws - in sync',
  'English - Erai-raws', // name first, so a prefix match can still classify it
  'English Erai-raws',
  'English/Erai-raws',
  'English|Erai-raws',
  'eng;Erai-raws',
  'Erai-raws (English)', // name last
  'en-Erai-raws', // BCP-47 shaped
];

/**
 * Build the probe response. Every entry points at the same real URL, so any row
 * that renders is also playable — selecting it confirms the mapping.
 */
export function buildProbeSubtitles(
  sample: RawSubtitle | undefined,
): Array<{ id: string; url: string; lang: string }> {
  const url =
    sample?.url ??
    'https://raw.githubusercontent.com/stremio/stremio-addon-sdk/master/README.md';

  return PROBE_FORMATS.map((lang, i) => ({
    id: `probe-${String(i + 1).padStart(2, '0')}`,
    url,
    lang,
  }));
}

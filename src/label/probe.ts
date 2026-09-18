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
  'en', // ISO 639-1
  'English', // full English name
  'English [Erai-raws]', // name + bracketed suffix
  'eng [Erai-raws]', // code + bracketed suffix
  'English - Erai-raws', // name + dash suffix
  'English (in sync)', // name + parenthetical
  'eng.Erai-raws', // code + dotted suffix
  'Erai-raws', // bare descriptive text, no language at all
  'English · Erai-raws · in sync', // the format RELABEL produces today
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

/**
 * Label construction.
 *
 * Stremio's subtitle object carries only `id`, `url` and `lang`, and the client
 * renders the language string verbatim. Addons that attach `label` or
 * `releaseName` are ignored, which is why a list of 45 English subtitles shows
 * as 45 identical rows reading "English". Writing the description into `lang`
 * is therefore the only way to make rows distinguishable on the device.
 *
 * The cost is that `lang` is also what Stremio matches for auto-select-by-
 * language, so relabelling is configurable.
 */
import type { Candidate } from '../types.js';

const LANG_NAMES: Record<string, string> = {
  eng: 'English',
  en: 'English',
  spa: 'Spanish',
  fre: 'French',
  fra: 'French',
  ger: 'German',
  deu: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  rus: 'Russian',
  ara: 'Arabic',
  urd: 'Urdu',
  hin: 'Hindi',
  jpn: 'Japanese',
  kor: 'Korean',
  chi: 'Chinese',
  zho: 'Chinese',
};

export function languageName(lang: string): string {
  const key = lang.toLowerCase().trim();
  return LANG_NAMES[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

/** Short note describing how well a verified candidate lines up. */
function timingNote(c: Candidate): string | undefined {
  const v = c.verification;
  if (!v?.ok) return undefined;
  if (v.agreement === undefined) return undefined;

  if (v.rate !== undefined && Math.abs(v.rate - 1) > 0.005) return 'drifts';
  if (v.offset !== undefined && Math.abs(v.offset) >= 1) {
    return `${v.offset > 0 ? '+' : ''}${v.offset.toFixed(1)}s`;
  }
  if (v.agreement >= 0.6) return 'in sync';
  return undefined;
}

/**
 * Build the string shown on the device, e.g.
 * `English · Erai-raws · exact file match` or `English · SDH · +2.5s`.
 */
export function buildLabel(c: Candidate, index: number, total: number): string {
  const parts: string[] = [languageName(c.raw.lang)];

  const reasons = c.reasons.filter((r) => r !== 'SDH');
  if (reasons.length > 0) parts.push(reasons.slice(0, 2).join(' '));
  else if (c.parsed.group) parts.push(c.parsed.group);
  else if (c.parsed.source) parts.push(c.parsed.source.toUpperCase());

  if (c.parsed.sdh) parts.push('SDH');

  const note = timingNote(c);
  if (note) parts.push(note);

  // A short rank prefix keeps the intended order obvious even if a client
  // re-sorts the list on its own.
  const width = String(total).length;
  const rank = String(index + 1).padStart(width, '0');
  return `${rank}. ${parts.join(' · ')}`;
}

/**
 * Text for the client's per-subtitle row.
 *
 * `label` is a real field on Stremio's Subtitles type (stremio-core:
 * `pub label: Option<String>`), separate from `lang`. Unlike `lang` it is free
 * text and is not mapped through a language dictionary, so it is the one place
 * a per-subtitle description can be put without the language column breaking.
 */
export function buildRowLabel(c: Candidate, index: number, total: number): string {
  const parts: string[] = [];
  const width = String(total).length;
  parts.push(`${String(index + 1).padStart(width, '0')}.`);

  const reasons = c.reasons.filter((r) => r !== 'SDH');
  if (reasons.length > 0) parts.push(reasons.slice(0, 3).join(' · '));
  else if (c.parsed.group) parts.push(c.parsed.group);
  else if (c.parsed.source) parts.push(c.parsed.source.toUpperCase());
  else if (c.raw.source) parts.push(String(c.raw.source));

  if (c.parsed.sdh) parts.push('SDH');
  return parts.join(' ');
}

/**
 * Per-anime arc identity.
 *
 * Some anime are split into arcs that every database and release group numbers
 * differently — IMDb/Cinemeta give each arc its own season, Crunchyroll folds
 * several into one, fansubs use absolute episode numbers — so OpenSubtitles (and
 * every other source) files subtitles for one arc under several season numbers
 * at once. A query by id and season therefore returns a mix of arcs, and the
 * wrong one usually outnumbers the right one.
 *
 * The arc itself is unambiguous, though: a release named "Katanakaji no Sato"
 * (Swordsmith Village) is that arc no matter what season number is stamped on
 * it. This maps each Cinemeta/IMDb season to the distinctive keywords that name
 * its arc, in both romaji and English, so the pipeline can keep the subtitles
 * that name the requested arc and drop the ones that name a different one.
 *
 * Keywords are matched against the release name with punctuation removed, so
 * "Sato-hen", "Sato.Hen" and "sato hen" are the same. Keep them distinctive:
 * a word that appears in every episode (a lead character's name) is useless and
 * would match everything, so arcs are named by their place/event, not people.
 */

export type ArcMap = Record<number, string[]>;

const ARCS: Record<string, ArcMap> = {
  // Demon Slayer: Kimetsu no Yaiba (tt9335498). Cinemeta season → arc keywords.
  tt9335498: {
    1: ['unwavering resolve', 'kamado tanjirou risshi', 'tanjiro kamado risshi', 'risshi hen'],
    2: ['mugen train', 'mugen ressha', 'ressha hen', 'infinity train'],
    3: ['entertainment district', 'yuukaku', 'yukaku', 'yukaku hen'],
    4: ['swordsmith village', 'swordsmith', 'katanakaji', 'sato hen'],
    5: ['hashira training', 'hashira geiko', 'geiko hen', 'pillar training'],
    6: ['infinity castle', 'mugenjou', 'mugen jou', 'mugenjo'],
  },
};

/** Arc keywords for the requested season, or [] when the anime is not mapped. */
export function arcKeywords(imdbId: string, season: number): string[] {
  return ARCS[imdbId]?.[season] ?? [];
}

/** Arc keywords for every *other* season of the same anime. */
export function foreignArcKeywords(imdbId: string, season: number): string[] {
  const map = ARCS[imdbId];
  if (!map) return [];
  const out: string[] = [];
  for (const [s, kws] of Object.entries(map)) {
    if (Number(s) !== season) out.push(...kws);
  }
  return out;
}

/** Whether an arc map exists for this anime at all. */
export function hasArcMap(imdbId: string): boolean {
  return ARCS[imdbId] !== undefined;
}

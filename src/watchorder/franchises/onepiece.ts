import { SAGAS } from '../data/onepiece.js';
import { arcLabel, pat } from '../styles.js';
import type { Franchise, Group, Item } from '../types.js';

const OP = 'tt0388629';
const KANJI = ['', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', '拾', '拾壱'];

/**
 * Filler removed, mixed canon/filler kept (it carries real story beats, e.g.
 * Shanks ending the war). Films that fit the story sit where fans place them.
 *
 * Sources: animefillerlist.com (filler, to ep 1168), the One Piece wiki's
 * Story Arcs page (arc ranges). Cinemeta numbers episodes by IMDb season, so
 * absolute numbers were mapped by order: abs 590 (a crossover special) is
 * S0E39 there, so everything from 591 sits one place earlier.
 */
const LOOK: Array<[string, Group['pattern']]> = [
  ['#1f5fa8', pat.stripes(160, ['#1f5fa8', 5], ['#9fd3ff', 2])], // East Blue
  ['#c9962e', pat.gradient('#6b4a14', '#c9962e', '#f5e0a8')], // Alabasta
  ['#5aa9d6', pat.gradient('#ffffff', '#bfe6ff', '#5aa9d6')], // Sky Island
  ['#1d8a8a', pat.stripes(90, ['#1d8a8a', 6], ['#e8f4f4', 2])], // Water 7
  ['#5b2a7a', pat.stripes(135, ['#5b2a7a', 5], ['#141018', 5])], // Thriller Bark
  ['#b3122e', pat.stripes(90, ['#b3122e', 6], ['#f2f2f2', 6])], // Summit War
  ['#2aa6b3', pat.gradient('#0b3a52', '#2aa6b3', '#c8f4ff')], // Fish-Man Island
  ['#d94f8c', pat.stripes(45, ['#d94f8c', 5], ['#f5d060', 3])], // Dressrosa
  ['#e07aa8', pat.checks('#e07aa8', '#fff1c8')], // Whole Cake Island
  ['#a8261e', pat.stripes(60, ['#a8261e', 5], ['#f6c7d4', 3])], // Wano
  ['#3a7bd5', pat.gradient('#101a3a', '#3a7bd5', '#8ff0ff')], // Final
];

/**
 * The image host files One Piece stills under TMDB's seasons, numbered by
 * overall episode (TMDB season 13 = episodes 422-522), not by IMDb season.
 * Boundaries found by probing every episode on 2026-09-26: no gaps.
 */
const TMDB_SEASONS: Array<[number, number]> = [
  [1, 1], [2, 62], [3, 78], [4, 92], [5, 131], [6, 144], [7, 196], [8, 229], [9, 264], [10, 337], [11, 382], [12, 408],
  [13, 422], [14, 523], [15, 581], [16, 643], [17, 693], [18, 749], [19, 804], [20, 878], [21, 892], [22, 1089], [23, 1156],
];
function stillFor(abs: number): string {
  let season = 1;
  for (const [s, from] of TMDB_SEASONS) if (abs >= from) season = s;
  return `https://episodes.metahub.space/${OP}/${season}/${abs}/w780.jpg`;
}
const absOf = new Map<string, number>();
for (const s of SAGAS) for (const it of s.items) if ('abs' in it) it.ids.forEach((id, i) => absOf.set(id, it.abs[i]!));
// Cinemeta season 23 (Elbaph) starts at overall episode 1156.
const still = (v: { id: string; season: number; episode: number }) => {
  const abs = absOf.get(v.id) ?? (v.season === 23 ? 1155 + v.episode : undefined);
  return abs ? stillFor(abs) : undefined;
};

const groups: Record<number, Group> = {};
const plan: Array<[number, Item[]]> = [];
SAGAS.forEach((s, i) => {
  const g = i + 1;
  const [color, pattern] = LOOK[i]!;
  groups[g] = { num: KANJI[g]!, name: `${s.saga} Saga`, short: s.saga, color, pattern };
  const items: Item[] = s.items.map((it) =>
    'movie' in it
      ? it.movie.includes(':')
        ? { series: OP, ids: [it.movie], title: it.title, optional: it.optional, optionalName: it.title, arc: () => it.title }
        : { movie: it.movie, title: it.title, optional: it.optional, optionalName: it.title }
      : { series: OP, ids: it.ids, arc: () => it.arc, sub: () => `${s.saga} Saga`, still });
  plan.push([g, items]);
});
// Elbaph onward, live: whatever Cinemeta has aired from season 23 on.
const final = plan.find(([g]) => groups[g]!.short === 'Final')!;
final[1].push({ series: OP, seasonsFrom: 23, arc: () => 'Elbaph', sub: () => 'Final Saga', still });

export const onePiece: Franchise = {
  id: 'onepiece',
  name: 'One Piece · Watch Order',
  style: 'anime',
  releaseInfo: '1999–',
  description: 'Filler removed (94 episodes), mixed canon kept. Films sit where they fit. Seasons are sagas; each thumbnail names its arc. New episodes join as they air.',
  poster: `https://images.metahub.space/poster/medium/${OP}/img`,
  background: `https://images.metahub.space/background/medium/${OP}/img`,
  logo: `https://images.metahub.space/logo/medium/${OP}/img`,
  groups,
  plan,
  label: arcLabel({ word: 'Saga', groupsTotal: SAGAS.length, optionalName: 'Special' }),
};

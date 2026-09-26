import { pat, titleLabel } from '../styles.js';
import type { Franchise, Group, Item } from '../types.js';

const TCW = 'tt0458290';
const tcw = (pairs: Array<[number, number, number?]>, extra: Partial<Item> = {}): Item => ({
  series: TCW,
  ids: pairs.flatMap(([s, from, to]) => Array.from({ length: (to ?? from) - from + 1 }, (_, i) => `${TCW}:${s}:${from + i}`)),
  short: 'The Clone Wars',
  title: 'The Clone Wars',
  ...extra,
});
const era = (n: number, name: string, color: string, pattern: Group['pattern']): Group => ({ num: String(n), name, color, pattern });

/**
 * Release order, each season at its premiere, shows split where releases
 * interleave. One swap: The Rise of Skywalker before The Mandalorian S1
 * (a week apart), so the Skywalker saga ends in one run.
 *
 * The Clone Wars is its essential arcs (SlashFilm's six plus Collider's
 * additions, and the Maul and Bad Batch set-ups), not all 133 episodes.
 * Skipped: Resistance, the Holiday Special, the Ewok films and 80s cartoons,
 * Young Jedi Adventures.
 */
export const starWars: Franchise = {
  id: 'starwars',
  name: 'Star Wars · Watch Order',
  style: 'western',
  releaseInfo: '1977–',
  description: 'Films and shows in release order, the animated shows before the live-action ones that build on them. The Clone Wars is its essential arcs. Seasons are eras.',
  poster: 'https://images.metahub.space/poster/medium/tt0076759/img',
  background: 'https://images.metahub.space/background/medium/tt0076759/img',
  logo: { accent: 'Star Wars', rest: 'Watch Order', color: '#ffe81f' },
  groups: {
    1: era(1, 'Original Trilogy', '#b8860b', pat.gradient('#000', '#ffe81f', '#000')),
    2: era(2, 'Prequels', '#1f5fa8', pat.stripes(90, ['#1f5fa8', 6], ['#e8e8e8', 2])),
    3: era(3, 'The Clone Wars', '#3d6b8f', pat.stripes(135, ['#3d6b8f', 5], ['#f2f2f2', 2], ['#1a1a1a', 3])),
    4: era(4, 'Rebels & Sequels', '#c2410c', pat.stripes(90, ['#c2410c', 8], ['#1c1c1c', 3])),
    5: era(5, 'Mandalorian Era', '#6b7280', pat.stripes(45, ['#9ca3af', 4], ['#374151', 4])),
    6: era(6, 'Andor & Ahsoka', '#7c3aed', pat.gradient('#1e1033', '#7c3aed', '#f97316')),
    7: era(7, 'Newest', '#b91c1c', pat.stripes(90, ['#b91c1c', 6], ['#0b0b0b', 6])),
  },
  plan: [
    [1, [{ movie: 'tt0076759', short: 'A New Hope' }, { movie: 'tt0080684', short: 'Empire Strikes Back' }, { movie: 'tt0086190', short: 'Return of the Jedi' }]],
    [2, [
      { movie: 'tt0120915', short: 'The Phantom Menace' }, { movie: 'tt0121765', short: 'Attack of the Clones' },
      { series: 'tt0361243', seasons: 'all', short: 'Clone Wars (2003)', title: 'Clone Wars (2003)', optional: true, note: 'Short, not canon; leads into Revenge of the Sith.' },
      { movie: 'tt0121766', short: 'Revenge of the Sith' },
    ]],
    [3, [
      { movie: 'tt1185834', short: 'The Clone Wars film', optional: true },
      tcw([[1, 5]], { optional: true }),
      tcw([[2, 12, 14], [3, 12, 17], [4, 7, 10], [4, 21, 22], [5, 1], [5, 14, 20], [6, 1, 4]]),
    ]],
    [4, [
      { series: 'tt2930604', seasons: [1, 2], short: 'Rebels', title: 'Rebels' },
      { movie: 'tt2488496', short: 'The Force Awakens' },
      { series: 'tt2930604', seasons: [3], short: 'Rebels', title: 'Rebels' },
      { movie: 'tt3748528', short: 'Rogue One' },
      { series: 'tt2930604', seasons: [4], short: 'Rebels', title: 'Rebels' },
      { movie: 'tt2527336', short: 'The Last Jedi' },
      { movie: 'tt3778644', short: 'Solo' },
      { movie: 'tt2527338', short: 'Rise of Skywalker' },
    ]],
    [5, [
      { series: 'tt8111088', seasons: [1], short: 'The Mandalorian', title: 'The Mandalorian' },
      tcw([[7, 1, 4]]),
      tcw([[7, 5, 8]], { optional: true }),
      tcw([[7, 9, 12]]),
      { series: 'tt8111088', seasons: [2], short: 'The Mandalorian', title: 'The Mandalorian' },
      { series: 'tt12708542', seasons: [1], short: 'The Bad Batch', title: 'The Bad Batch' },
      { series: 'tt13622982', seasons: [1], short: 'Visions', title: 'Visions', optional: true },
      { series: 'tt13668894', seasons: [1], short: 'Book of Boba Fett', title: 'The Book of Boba Fett', note: 'Chapters 5-7 lead into The Mandalorian S3.' },
      { series: 'tt8466564', seasons: [1], short: 'Obi-Wan Kenobi', title: 'Obi-Wan Kenobi' },
    ]],
    [6, [
      { series: 'tt9253284', seasons: [1], short: 'Andor', title: 'Andor' },
      { series: 'tt20723374', seasons: [1], short: 'Tales of the Jedi', title: 'Tales of the Jedi' },
      { series: 'tt12708542', seasons: [2], short: 'The Bad Batch', title: 'The Bad Batch' },
      { series: 'tt8111088', seasons: [3], short: 'The Mandalorian', title: 'The Mandalorian' },
      { series: 'tt13622982', seasons: [2], short: 'Visions', title: 'Visions', optional: true },
      { series: 'tt13622776', seasons: [1], short: 'Ahsoka', title: 'Ahsoka', note: 'Continues Rebels directly.' },
      { series: 'tt12708542', seasons: [3], short: 'The Bad Batch', title: 'The Bad Batch' },
      { series: 'tt32019314', seasons: [1], short: 'Tales of the Empire', title: 'Tales of the Empire' },
      { series: 'tt12262202', seasons: [1], short: 'The Acolyte', title: 'The Acolyte', optional: true },
      { series: 'tt20600980', seasons: [1], short: 'Skeleton Crew', title: 'Skeleton Crew' },
    ]],
    [7, [
      { series: 'tt9253284', seasons: [2], short: 'Andor', title: 'Andor' },
      { series: 'tt36414431', seasons: [1], short: 'Tales of the Underworld', title: 'Tales of the Underworld' },
      { series: 'tt13622982', seasons: [3], short: 'Visions', title: 'Visions', optional: true },
      { series: 'tt36594331', seasons: [1], short: 'Maul: Shadow Lord', title: 'Maul: Shadow Lord' },
      { movie: 'tt30825738', short: 'Mandalorian & Grogu' },
      { series: 'tt43337681', seasons: [1], short: 'The Ninth Jedi', title: 'Visions Presents: The Ninth Jedi', optional: true },
      // Announced: appear once released.
      { series: 'tt13622776', seasons: [2], short: 'Ahsoka', title: 'Ahsoka' },
      { movie: 'tt28069611', short: 'Starfighter' },
    ]],
  ],
  label: titleLabel({ word: 'Era', numOf: String }),
};

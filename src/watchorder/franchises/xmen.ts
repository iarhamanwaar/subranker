import { pat, titleLabel } from '../styles.js';
import type { Franchise, Group } from '../types.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const g = (n: number, name: string, color: string, pattern: Group['pattern']): Group => ({ num: ROMAN[n]!, name, color, pattern });

export const xmen: Franchise = {
  id: 'xmen',
  name: 'X-Men · Watch Order',
  style: 'xmen',
  releaseInfo: '2000–',
  description: "The Fox X-Men films in release order, then X-Men '97. Watch this before Deadpool & Wolverine in the MCU playlist. Seasons are eras.",
  poster: 'https://images.metahub.space/poster/medium/tt1877832/img',
  background: 'https://images.metahub.space/background/medium/tt1877832/img',
  logo: { accent: 'X-Men', rest: 'Watch Order' },
  groups: {
    1: g(1, 'The original trilogy', '#3a3f47', pat.stripes(90, ['#1b1d21', 6], ['#7d858f', 2])),
    2: g(2, 'Origins and prequels', '#2f63b3', pat.stripes(135, ['#f2c230', 6], ['#2f63b3', 6])),
    3: g(3, 'The new timeline', '#8c2f39', pat.stripes(135, ['#8c2f39', 6], ['#e7c14b', 2], ['#1c1c24', 4])),
    4: g(4, "X-Men '97", '#d9a514', pat.stripes(90, ['#f2c230', 8], ['#2d5fb0', 8])),
  },
  plan: [
    [1, [{ movie: 'tt0120903' }, { movie: 'tt0290334', short: 'X2' }, { movie: 'tt0376994', short: 'The Last Stand' }]],
    [2, [{ movie: 'tt0458525', short: 'Origins: Wolverine' }, { movie: 'tt1270798', short: 'First Class' }, { movie: 'tt1430132' }]],
    [3, [
      { movie: 'tt1877832', short: 'Days of Future Past', note: 'Resets the timeline.' },
      { movie: 'tt1431045' }, { movie: 'tt3385516', short: 'Apocalypse' }, { movie: 'tt3315342' },
      { movie: 'tt5463162' }, { movie: 'tt6565702' },
    ]],
    // Every season, so new ones join as they air.
    [4, [{ series: 'tt16026746', seasons: 'all', short: "X-Men '97", note: 'Animated, its own continuity.' }]],
  ],
  label: titleLabel({ word: 'Era', numOf: (n) => ROMAN[n]! }),
};

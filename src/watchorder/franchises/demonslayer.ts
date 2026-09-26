import { arcLabel, pat } from '../styles.js';
import type { Franchise } from '../types.js';

const DS = 'tt9335498';

export const demonSlayer: Franchise = {
  id: 'demonslayer',
  name: 'Demon Slayer · Watch Order',
  style: 'ds',
  releaseInfo: '2019–',
  description: 'Release order, one playlist. Season 2 is the Mugen Train TV arc: it holds the whole movie plus a new Rengoku episode and extra scenes, so the movie itself is not needed.',
  poster: `https://images.metahub.space/poster/medium/${DS}/img`,
  background: `https://images.metahub.space/background/medium/${DS}/img`,
  logo: `https://images.metahub.space/logo/medium/${DS}/img`,
  groups: {
    1: { num: '壱', name: 'Unwavering Resolve', color: '#1d7a52', pattern: pat.checks('#1d7a52') },
    2: { num: '弐', name: 'Mugen Train', color: '#e8531c', pattern: pat.gradient('#ffd23a', '#ff7a1a 55%', '#d9261c') },
    3: { num: '参', name: 'Entertainment District', short: 'Ent. District', color: '#c63f8c', pattern: pat.stripes(135, ['#e0559b', 5], ['#5b2a96', 5]) },
    4: { num: '肆', name: 'Swordsmith Village', color: '#2aa596', pattern: pat.gradient('#17323f', '#3fc1b0 60%', '#e4fbf6') },
    5: { num: '伍', name: 'Hashira Training', color: '#7a1f2b', pattern: pat.stripes(60, ['#cdb73c', 3], ['#365f33', 5]) },
    6: { num: '陸', name: 'Infinity Castle', color: '#b3122e', pattern: pat.stripes(90, ['#b3122e', 9], ['#1a0508', 2]) },
  },
  plan: [
    [1, [{ series: DS, seasons: [1] }]],
    [2, [
      { series: DS, seasons: [2] },
      // Kimetsu Academy comedy shorts (Feb 2021), after the Mugen Train story.
      { series: DS, ids: [`${DS}:0:3`, `${DS}:0:4`, `${DS}:0:5`, `${DS}:0:6`], optional: true, optionalName: 'Kimetsu Academy' },
    ]],
    [3, [{ series: DS, seasons: [3] }]],
    [4, [{ series: DS, seasons: [4] }]],
    [5, [{ series: DS, seasons: [5] }]],
    // Infinity Castle is a film trilogy; parts 2 and 3 join here once released.
    [6, [{ movie: 'tt32820897', title: 'Infinity Castle Part 1' }]],
  ],
  label: arcLabel({ groupsTotal: 6, optionalName: 'Kimetsu Academy' }),
};

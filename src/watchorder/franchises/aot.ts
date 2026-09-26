import { arcLabel, pat } from '../styles.js';
import type { Franchise } from '../types.js';

const AOT = 'tt2560140';
const eps = (s: number, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${AOT}:${s}:${from + i}`);
const ova = (ids: number[], name: string) => ({ series: AOT, ids: ids.map((e) => `${AOT}:0:${e}`), optional: true, optionalName: name });

/**
 * The OVAs are optional, each placed where it came out and where guides put
 * it. Skipped: recaps, chibi theaters, compilation films, the Omnibus nights,
 * The Last Attack (the two final specials joined into one film) and the
 * live-action films.
 */
export const aot: Franchise = {
  id: 'aot',
  name: 'Attack on Titan · Watch Order',
  style: 'anime',
  releaseInfo: '2013–2023',
  description: 'The whole series in release order, with the OVAs as optional side stories where they belong. Seasons are arcs; Season 3 is split at its Part 2.',
  poster: `https://images.metahub.space/poster/medium/${AOT}/img`,
  background: `https://images.metahub.space/background/medium/${AOT}/img`,
  logo: `https://images.metahub.space/logo/medium/${AOT}/img`,
  groups: {
    1: { num: '壱', name: 'Fall of Shiganshina', short: 'Shiganshina', color: '#7a5a2e', pattern: pat.stripes(90, ['#7a5a2e', 8], ['#2a2016', 3]) },
    2: { num: '弐', name: 'Clash of the Titans', color: '#8f3a2a', pattern: pat.gradient('#2a120d', '#8f3a2a', '#e0a070') },
    3: { num: '参', name: 'Uprising', color: '#2f5d3a', pattern: pat.stripes(135, ['#2f5d3a', 6], ['#e8e2d0', 2]) },
    4: { num: '肆', name: 'Return to Shiganshina', short: 'Return to Shiganshina', color: '#4d6b8a', pattern: pat.gradient('#1a2530', '#4d6b8a', '#c9d6e3') },
    5: { num: '伍', name: 'Marley', color: '#6b6b6b', pattern: pat.stripes(90, ['#6b6b6b', 6], ['#1c1c1c', 6]) },
    6: { num: '陸', name: 'War for Paradis', color: '#8c1c1c', pattern: pat.stripes(45, ['#8c1c1c', 5], ['#140606', 5]) },
    7: { num: '漆', name: 'The Final Chapters', color: '#b89a5a', pattern: pat.gradient('#2a2216', '#b89a5a', '#f2e6c8') },
  },
  plan: [
    [1, [{ series: AOT, seasons: [1] }, ova([7], "Ilse's Notebook"), ova([12], 'The Sudden Visitor'), ova([13], 'Distress'), ova([15, 17], 'No Regrets')]],
    [2, [{ series: AOT, seasons: [2] }, ova([20, 22], 'Lost Girls')]],
    [3, [{ series: AOT, ids: eps(3, 1, 12) }, ova([23], 'Lost Girls')]],
    [4, [{ series: AOT, ids: eps(3, 13, 22) }]],
    [5, [{ series: AOT, ids: eps(4, 1, 16) }]],
    [6, [{ series: AOT, ids: eps(4, 17, 28) }]],
    [7, [{ series: AOT, ids: eps(4, 29, 30) }]],
  ],
  label: arcLabel({ groupsTotal: 7, optionalName: 'OVA' }),
};

import { arcLabel, pat } from '../styles.js';
import type { Franchise } from '../types.js';

const JJK = 'tt12343534';
const eps = (s: number, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${JJK}:${s}:${from + i}`);

/**
 * JJK 0 sits between seasons 1 and 2: it came out there and it sets up Yuta
 * and Geto for what follows. Skipped: recap specials, the Hidden Inventory
 * re-cut film and "Execution" (a Shibuya recap plus S3E1-2).
 */
export const jjk: Franchise = {
  id: 'jjk',
  name: 'Jujutsu Kaisen · Watch Order',
  style: 'anime',
  releaseInfo: '2020–',
  description: 'Release order with Jujutsu Kaisen 0 in its place between seasons 1 and 2. Recaps and re-cut films are left out. Seasons are arcs.',
  poster: `https://images.metahub.space/poster/medium/${JJK}/img`,
  background: `https://images.metahub.space/background/medium/${JJK}/img`,
  logo: `https://images.metahub.space/logo/medium/${JJK}/img`,
  groups: {
    1: { num: '壱', name: 'Cursed Beginnings', color: '#3b3f8f', pattern: pat.stripes(135, ['#3b3f8f', 6], ['#141428', 4]) },
    2: { num: '弐', name: 'Kyoto Goodwill Event', short: 'Kyoto Goodwill', color: '#7a2b8f', pattern: pat.gradient('#2a1245', '#7a2b8f', '#e05ad8') },
    3: { num: '参', name: 'Jujutsu Kaisen 0', color: '#1f6f8b', pattern: pat.gradient('#0d2c3a', '#1f6f8b', '#9fe3f0') },
    4: { num: '肆', name: 'Hidden Inventory', color: '#2d7fc1', pattern: pat.stripes(90, ['#2d7fc1', 8], ['#f2f2f2', 2]) },
    5: { num: '伍', name: 'Shibuya Incident', color: '#b0253a', pattern: pat.stripes(45, ['#b0253a', 5], ['#1a0a10', 5]) },
    6: { num: '陸', name: 'The Culling Game', color: '#d98b1c', pattern: pat.checks('#d98b1c', '#1d1208') },
  },
  plan: [
    [1, [{ series: JJK, ids: eps(1, 1, 13) }]],
    [2, [{ series: JJK, ids: eps(1, 14, 24) }]],
    [3, [{ movie: 'tt14331144', title: 'Jujutsu Kaisen 0' }]],
    [4, [{ series: JJK, ids: eps(2, 1, 5) }]],
    [5, [{ series: JJK, ids: eps(2, 6, 23) }]],
    // Part 2 is expected as Cinemeta season 4; everything from 3 on joins here as it airs.
    [6, [{ series: JJK, seasonsFrom: 3 }]],
  ],
  label: arcLabel({ groupsTotal: 6, optionalName: 'Extra' }),
};

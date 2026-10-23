import { pat, titleLabel } from '../styles.js';
import type { Franchise, Group } from '../types.js';

const saga = (num: string, name: string, color: string): Group => ({ num, name, color, pattern: pat.dots(color) });

/**
 * Rotten Tomatoes' "MCU Chronological Watch Order: Movies and Disney+ Shows"
 * (editorial.rottentomatoes.com/guide/marvel-movies-in-order/), reproduced
 * exactly: every one of its 82 entries, in its in-universe order, including the
 * Marvel One-Shots, Item 47 and the Netflix street-level shows.
 *
 * The three seasons are contiguous slices of that same list — navigation jump
 * points, not a re-ordering. Nothing is moved: RT's own position is shown as
 * "#N of 82", which is the real watch sequence. Shows RT places at several
 * points (Daredevil, Jessica Jones, Loki, What If…?, Born Again) are split by
 * season exactly where RT lists each one. Titles not out yet (VisionQuest,
 * later Avengers films) appear by themselves once a rebuild sees them released.
 */
export const mcuChrono: Franchise = {
  id: 'mcuchrono',
  name: 'MCU · Chronological (RT)',
  style: 'mcu',
  releaseInfo: 'Timeline',
  description: "Rotten Tomatoes' full chronological MCU timeline — all 82 films and shows in in-universe order, including the One-Shots and the Netflix series. Seasons are the two Sagas plus the earliest-set titles; #N of 82 is RT's own order.",
  // Loki (the TVA / timeline) art, so the chronological card reads differently
  // from the Endgame-based release-order MCU card.
  poster: 'https://images.metahub.space/poster/medium/tt9140554/img',
  background: 'https://images.metahub.space/background/medium/tt9140554/img',
  logo: { accent: 'MCU', rest: 'Chronological' },
  groups: {
    1: saga('I', 'Early Timeline', '#c9971c'),
    2: saga('II', 'The Infinity Saga', '#c8102e'),
    3: saga('III', 'The Multiverse Saga', '#2b6cd4'),
  },
  plan: [
    [1, [
      { series: 'tt13968252', seasons: [1], title: 'Eyes of Wakanda' },
      { movie: 'tt0458339', title: 'Captain America: The First Avenger', short: 'The First Avenger' },
      { movie: 'tt3067038', title: 'Marvel One-Shot: Agent Carter', short: 'One-Shot: Agent Carter' },
      { series: 'tt3475734', seasons: [1, 2], title: 'Agent Carter' },
      { movie: 'tt10676052', title: 'The Fantastic Four: First Steps', short: 'Fantastic Four' },
      { movie: 'tt4154664', title: 'Captain Marvel' },
    ]],
    [2, [
      { movie: 'tt0371746', title: 'Iron Man' },
      { movie: 'tt1228705', title: 'Iron Man 2' },
      { movie: 'tt0800080', title: 'The Incredible Hulk' },
      { movie: 'tt2011109', title: "Marvel One-Shot: A Funny Thing Happened on the Way to Thor's Hammer", short: "One-Shot: Thor's Hammer" },
      { movie: 'tt0800369', title: 'Thor' },
      { movie: 'tt2011118', title: 'Marvel One-Shot: The Consultant', short: 'One-Shot: The Consultant' },
      { movie: 'tt0848228', title: 'The Avengers' },
      { movie: 'tt2247732', title: 'Marvel One-Shot: Item 47', short: 'One-Shot: Item 47' },
      { movie: 'tt1981115', title: 'Thor: The Dark World', short: 'The Dark World' },
      { movie: 'tt1300854', title: 'Iron Man 3' },
      { movie: 'tt1843866', title: 'Captain America: The Winter Soldier', short: 'The Winter Soldier' },
      { movie: 'tt2015381', title: 'Guardians of the Galaxy' },
      { series: 'tt13623148', seasons: 'all', title: 'I Am Groot' },
      { movie: 'tt3896198', title: 'Guardians of the Galaxy Vol. 2', short: 'Guardians Vol. 2' },
      { series: 'tt3322312', seasons: [1], title: 'Daredevil' },
      { series: 'tt2357547', seasons: [1], title: 'Jessica Jones' },
      { movie: 'tt2395427', title: 'Avengers: Age of Ultron', short: 'Age of Ultron' },
      { movie: 'tt0478970', title: 'Ant-Man' },
      { series: 'tt3322312', seasons: [2], title: 'Daredevil' },
      { series: 'tt3322314', seasons: [1], title: 'Luke Cage' },
      { series: 'tt3322310', seasons: [1], title: 'Iron Fist' },
      { series: 'tt4230076', seasons: [1], title: 'The Defenders' },
      { movie: 'tt3498820', title: 'Captain America: Civil War', short: 'Civil War' },
      { series: 'tt16027074', seasons: [1], title: 'Your Friendly Neighborhood Spider-Man', short: 'Friendly Neighborhood' },
      { movie: 'tt3480822', title: 'Black Widow' },
      { movie: 'tt1825683', title: 'Black Panther' },
      { movie: 'tt2250912', title: 'Spider-Man: Homecoming' },
      { series: 'tt5675620', seasons: [1], title: 'The Punisher' },
      { movie: 'tt1211837', title: 'Doctor Strange' },
      { series: 'tt2357547', seasons: [2], title: 'Jessica Jones' },
      { series: 'tt3322314', seasons: [2], title: 'Luke Cage' },
      { series: 'tt3322310', seasons: [2], title: 'Iron Fist' },
      { series: 'tt3322312', seasons: [3], title: 'Daredevil' },
      { movie: 'tt3501632', title: 'Thor: Ragnarok', short: 'Ragnarok' },
      { series: 'tt5675620', seasons: [2], title: 'The Punisher' },
      { series: 'tt2357547', seasons: [3], title: 'Jessica Jones' },
      { movie: 'tt5095030', title: 'Ant-Man and the Wasp', short: 'Ant-Man & the Wasp' },
      { movie: 'tt4154756', title: 'Avengers: Infinity War', short: 'Infinity War' },
      { movie: 'tt4154796', title: 'Avengers: Endgame', short: 'Endgame' },
    ]],
    [3, [
      { series: 'tt16027014', seasons: [1], title: 'Marvel Zombies' },
      { series: 'tt9140560', seasons: [1], title: 'WandaVision' },
      { series: 'tt9140554', seasons: [1], title: 'Loki' },
      { movie: 'tt6263850', title: 'Deadpool & Wolverine', note: 'Best after the X-Men order.' },
      { movie: 'tt9376612', title: 'Shang-Chi and the Legend of the Ten Rings', short: 'Shang-Chi' },
      { series: 'tt9208876', seasons: [1], title: 'The Falcon and the Winter Soldier', short: 'Falcon & Winter Soldier' },
      { movie: 'tt6320628', title: 'Spider-Man: Far From Home', short: 'Far From Home' },
      { movie: 'tt9032400', title: 'Eternals' },
      { movie: 'tt10872600', title: 'Spider-Man: No Way Home', short: 'No Way Home' },
      { movie: 'tt9419884', title: 'Doctor Strange in the Multiverse of Madness', short: 'Multiverse of Madness' },
      { series: 'tt10160804', seasons: [1], title: 'Hawkeye' },
      { series: 'tt10168312', seasons: [1], title: 'What If...?' },
      { series: 'tt10234724', seasons: [1], title: 'Moon Knight' },
      { movie: 'tt9114286', title: 'Black Panther: Wakanda Forever', short: 'Wakanda Forever' },
      { series: 'tt13966962', seasons: [1], title: 'Echo' },
      { series: 'tt10857160', seasons: [1], title: 'She-Hulk: Attorney at Law', short: 'She-Hulk' },
      { series: 'tt10857164', seasons: [1], title: 'Ms. Marvel' },
      { movie: 'tt10648342', title: 'Thor: Love and Thunder', short: 'Love and Thunder' },
      { movie: 'tt15318872', title: 'Werewolf by Night' },
      { series: 'tt13623126', seasons: [1], title: 'Ironheart' },
      { movie: 'tt13623136', title: 'The Guardians of the Galaxy Holiday Special', short: 'Holiday Special' },
      { series: 'tt21066182', seasons: [1], title: 'Wonder Man' },
      { movie: 'tt10954600', title: 'Ant-Man and the Wasp: Quantumania', short: 'Quantumania' },
      { movie: 'tt6791350', title: 'Guardians of the Galaxy Vol. 3', short: 'Guardians Vol. 3' },
      { series: 'tt13157618', seasons: [1], title: 'Secret Invasion' },
      { movie: 'tt10676048', title: 'The Marvels' },
      { series: 'tt9140554', seasons: [2], title: 'Loki' },
      { series: 'tt10168312', seasons: [2], title: 'What If...?' },
      { series: 'tt15571732', seasons: [1], title: 'Agatha All Along' },
      { series: 'tt10168312', seasons: [3], title: 'What If...?' },
      { series: 'tt18923754', seasons: [1], title: 'Daredevil: Born Again', short: 'Born Again' },
      { movie: 'tt14513804', title: 'Captain America: Brave New World', short: 'Brave New World' },
      { movie: 'tt20969586', title: 'Thunderbolts*' },
      { series: 'tt18923754', seasons: [2], title: 'Daredevil: Born Again', short: 'Born Again' },
      { movie: 'tt36042156', title: 'The Punisher: One Last Kill', short: 'One Last Kill' },
      { series: 'tt23112594', seasons: [1], title: 'VisionQuest' },
      { movie: 'tt22084616', title: 'Spider-Man: Brand New Day', short: 'Brand New Day' },
    ]],
  ],
  label: titleLabel({ word: 'Saga', numOf: (g) => ['', 'I', 'II', 'III'][g] ?? String(g) }),
};

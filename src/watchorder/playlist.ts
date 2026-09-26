/**
 * Expand a franchise into its ordered videos.
 *
 * Only what has aired is included: titles announced but not out yet are left
 * out, so they appear by themselves once a rebuild sees them released. The
 * same goes for new episodes of a season that is still airing.
 */
import { OPTIONAL_GROUP } from './styles.js';
import type { Entry, Franchise, Item, PlaylistVideo, SourceMeta, SourceVideo } from './types.js';

export type MetaGetter = (type: 'movie' | 'series', id: string) => Promise<SourceMeta>;

/** The TV shows about 200 characters of description; the rest is weight. */
const OVERVIEW_MAX = 240;

export function runtime(s: string | undefined): string | undefined {
  const m = parseInt(s ?? '', 10);
  return m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : undefined;
}

const day = (d: string | undefined) => (d ? d.slice(0, 10) : undefined);
const aired = (released: string | undefined, today: string) => !!released && day(released)! <= today;

function clip(s: string): string {
  if (s.length <= OVERVIEW_MAX) return s;
  const cut = s.slice(0, OVERVIEW_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), OVERVIEW_MAX - 20))}…`;
}

function wanted(it: Extract<Item, { series: string }>, v: SourceVideo): boolean {
  if (it.skip && (it.skip instanceof Set ? it.skip.has(v.id) : (it.skip as string[]).includes(v.id))) return false;
  if (it.ids) return it.ids.includes(v.id);
  if (it.seasons === 'all') return v.season > 0;
  if (it.seasonsFrom != null) return v.season >= it.seasonsFrom;
  return (it.seasons ?? []).includes(v.season);
}

export async function expand(f: Franchise, get: MetaGetter, today: string): Promise<PlaylistVideo[]> {
  const videos: PlaylistVideo[] = [];
  const totalTitles = f.plan.reduce((n, [, items]) => n + items.length, 0);
  let order = 0;

  for (const [g, items] of f.plan) {
    const group = f.groups[g];
    if (!group) throw new Error(`${f.id}: no group ${g}`);

    // Resolve every item first, so positions within the season are known
    // before anything is labelled.
    const entries: Entry[] = [];
    for (const it of items) {
      order++;
      if ('movie' in it) {
        const m = await get('movie', it.movie);
        if (!aired(m.released, today)) continue;
        entries.push({
          kind: 'movie', item: it, order, id: it.movie, name: it.title ?? m.name, released: day(m.released),
          thumbnail: `https://images.metahub.space/background/medium/${it.movie}/img`,
          desc: m.description, runtime: runtime(m.runtime), index: 0, count: 1, seasonCount: 1, multiSeason: false,
        });
        continue;
      }
      const meta = await get('series', it.series);
      const eps = (meta.videos ?? []).filter((v) => wanted(it, v) && aired(v.released, today));
      eps.sort(it.ids ? (a, b) => it.ids!.indexOf(a.id) - it.ids!.indexOf(b.id) : (a, b) => a.season - b.season || a.episode - b.episode);
      const seasons = [...new Set(eps.map((v) => v.season))];
      const multiSeason = seasons.length > 1 || (seasons[0] ?? 1) > 1;
      eps.forEach((v, i) => {
        entries.push({
          kind: 'episode', item: it, order, id: v.id, name: v.name ?? v.title ?? `Episode ${v.episode}`, released: day(v.released),
          thumbnail: it.still?.(v) ?? v.thumbnail, desc: v.overview ?? v.description, video: v, season: v.season, episode: v.episode,
          index: i, count: eps.length, seasonCount: eps.filter((x) => x.season === v.season).length, multiSeason,
        });
      });
    }

    const main = entries.filter((e) => !e.item.optional);
    const optional = entries.filter((e) => e.item.optional);
    entries.forEach((e, n) => {
      const pool = e.item.optional ? optional : main;
      const lab = f.label(e, { g, group, pos: pool.indexOf(e) + 1, of: pool.length, totalTitles });
      const look = e.item.optional ? OPTIONAL_GROUP : group;
      videos.push({
        id: e.id, season: g, episode: n + 1, title: lab.title, released: e.released,
        overview: clip(`${lab.lead} ${e.desc ?? ''}`.trim()), source: e.thumbnail,
        optional: !!e.item.optional, label: lab.thumb, groupColor: look.color, groupPattern: look.pattern,
      });
    });
  }
  return videos;
}

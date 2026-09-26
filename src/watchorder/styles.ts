/**
 * Label styles: the TV's title line, the opening words of the description and
 * the label baked into the thumbnail.
 *
 * The Android TV series page shows one title line (`S02E02 - date - title`)
 * and two lines of description, so whatever tells the viewer where they are
 * goes first in both.
 */
import type { Entry, Group, LabelContext, Labelled, Pattern } from './types.js';

export const OPTIONAL_GROUP: Pick<Group, 'color' | 'pattern'> = {
  color: '#5d5a6e',
  pattern: { backgroundImage: 'repeating-linear-gradient(90deg, #8a8799 0px, #8a8799 6px, transparent 6px, transparent 10px)' },
};

/** Anime: a season is an arc; label = arc numeral, arc name, place in the arc. */
export function arcLabel(opts: { word?: string; groupsTotal: number; optionalNum?: string; optionalName: string }) {
  const word = opts.word ?? 'Arc';
  return (e: Entry, { g, group, pos, of }: LabelContext): Labelled => {
    const it = e.item;
    if (it.optional) {
      const what = it.optionalName ?? opts.optionalName;
      return {
        title: `OPTIONAL · ${it.title ?? e.name}`,
        lead: `Optional: ${what} · ${pos} of ${of}${e.kind === 'movie' && e.runtime ? ` · ${e.runtime}` : ''}. Safe to skip.`,
        thumb: { mode: 'tag', num: opts.optionalNum ?? '番外', sub: 'Optional', main: what, pos: `${pos}/${of}` },
      };
    }
    const arc = (e.video && it.arc?.(e.video)) ?? group.name;
    const where = `${word} ${g} of ${opts.groupsTotal}: ${arc} · ${pos} of ${of}`;
    if (e.kind === 'movie') {
      return {
        title: `MOVIE · ${it.title ?? e.name}`,
        lead: `${where}${e.runtime ? ` · ${e.runtime}` : ''}.${it.note ? ` ${it.note}` : ''}`,
        thumb: { mode: 'ribbon', jp: '劇場版', main: 'MOVIE', rt: e.runtime ?? '' },
      };
    }
    return {
      title: e.name,
      lead: `${where}.`,
      thumb: {
        mode: 'tag',
        num: group.num,
        sub: (e.video && it.sub?.(e.video)) ?? `${word} ${g}`,
        main: it.arc ? arc : (group.short ?? group.name),
        pos: `${pos}/${of}`,
      },
    };
  };
}

/**
 * Western franchises: a season is a Phase or era and each title is labelled
 * with its own short name. Films show their place in the whole order (#14),
 * episodes their number within the show (E3/9).
 */
export function titleLabel(opts: { word: string; numOf: (g: number) => string }) {
  return (e: Entry, { g, totalTitles }: LabelContext): Labelled => {
    const it = e.item;
    const short = it.short ?? it.title ?? e.name;
    const n = opts.numOf(g);
    const note = it.note ? ` ${it.note}` : '';
    const opt = it.optional ? 'Optional · ' : '';
    const optTitle = it.optional ? 'OPTIONAL · ' : '';
    const head = it.optional ? 'Optional' : `${opts.word} ${n}`;
    if (e.kind === 'movie') {
      return {
        title: `${optTitle}${e.name}`,
        lead: `${opt}${opts.word} ${n} · #${e.order} of ${totalTitles}${e.runtime ? ` · ${e.runtime}` : ''}.${note}`,
        thumb: { mode: 'tag', num: n, sub: `${head} · Film`, main: short, pos: `#${e.order}` },
      };
    }
    const s = e.multiSeason ? ` S${e.season}` : '';
    return {
      title: `${optTitle}${short}${s} · ${e.name}`,
      lead: `${opt}${opts.word} ${n} · #${e.order} · ${it.title ?? short}${s}, episode ${e.episode} (${e.index + 1} of ${e.count}).${note}`,
      // A hand-picked set (the essential Clone Wars arcs) counts within the
      // set; a whole season counts episodes of the season.
      thumb: { mode: 'tag', num: n, sub: `${head} · Series${s}`, main: short, pos: 'ids' in it && it.ids ? `${e.index + 1}/${e.count}` : `E${e.episode}/${e.seasonCount}` },
    };
  };
}

/** Pattern strips, as satori style objects. */
export const pat = {
  solid: (c: string): Pattern => ({ backgroundColor: c }),
  gradient: (...stops: string[]): Pattern => ({ backgroundImage: `linear-gradient(90deg, ${stops.join(', ')})` }),
  stripes: (angle: number, ...bands: Array<[string, number]>): Pattern => {
    let at = 0;
    const parts: string[] = [];
    for (const [c, w] of bands) {
      parts.push(`${c} ${at}px`, `${c} ${at + w}px`);
      at += w;
    }
    return { backgroundImage: `repeating-linear-gradient(${angle}deg, ${parts.join(', ')})` };
  },
  dots: (c: string, bg = '#0b0a12'): Pattern => ({
    backgroundColor: bg,
    backgroundImage: `radial-gradient(circle, ${c} 1.3px, transparent 1.7px)`,
    backgroundSize: '5px 5px',
  }),
  checks: (c: string, dark = '#0d0d0d'): Pattern => ({
    backgroundColor: c,
    backgroundImage: `linear-gradient(45deg, ${dark} 25%, transparent 25%, transparent 75%, ${dark} 75%), linear-gradient(45deg, ${dark} 25%, transparent 25%, transparent 75%, ${dark} 75%)`,
    backgroundSize: '8px 8px',
    backgroundPosition: '0 0, 4px 4px',
  }),
};

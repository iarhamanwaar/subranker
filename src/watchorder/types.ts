/**
 * Watch Order: curated franchise playlists served as Stremio series.
 *
 * Each playlist is one series whose videos are real episode and movie ids
 * (`tt…:s:e`, `tt…`), so the user's stream and subtitle addons resolve them
 * exactly as they would on the original title. Stremio orders videos by season
 * then episode and shows only "Season N" on its buttons, so a playlist season
 * is a jump point (an arc, a Phase, an era) and a label baked into each
 * thumbnail says what it is.
 */

/** Style object handed to satori for a season's pattern strip. */
export type Pattern = Record<string, string>;

export interface Group {
  /** Mark in the numeral block: 壱, 4, III. */
  num: string;
  name: string;
  /** Shorter form for the thumbnail when `name` is long. */
  short?: string;
  color: string;
  pattern: Pattern;
}

/** Cinemeta video, as far as this module reads it. */
export interface SourceVideo {
  id: string;
  season: number;
  episode: number;
  name?: string;
  title?: string;
  released?: string;
  thumbnail?: string;
  overview?: string;
  description?: string;
}

export interface SourceMeta {
  id: string;
  name: string;
  released?: string;
  runtime?: string;
  description?: string;
  background?: string;
  logo?: string;
  poster?: string;
  videos?: SourceVideo[];
}

interface ItemBase {
  /** Grey, marked optional, still in autoplay order. */
  optional?: boolean;
  /** Name used on the thumbnail instead of the title. */
  short?: string;
  /** Display title override. */
  title?: string;
  /** Appended to the description's first sentence. */
  note?: string;
  /** What an optional item is, e.g. "Kimetsu Academy". */
  optionalName?: string;
  /** Per-episode arc name, for long series labelled by arc. */
  arc?: (v: SourceVideo) => string;
  /** Per-episode small caps line above the arc name. */
  sub?: (v: SourceVideo) => string;
}

export interface MovieItem extends ItemBase {
  movie: string;
}

export interface SeriesItem extends ItemBase {
  series: string;
  /** Which seasons: a list, every season, or every season from N on. */
  seasons?: number[] | 'all';
  seasonsFrom?: number;
  /** Exact episodes in this order; overrides `seasons`. */
  ids?: string[];
  /** Episodes to leave out (filler, recaps). */
  skip?: ReadonlySet<string> | string[];
}

export type Item = MovieItem | SeriesItem;

/** One resolved entry, before labelling. */
export interface Entry {
  kind: 'movie' | 'episode';
  item: Item;
  /** Position of the item (film or show block) in the whole playlist. */
  order: number;
  id: string;
  name: string;
  released?: string;
  thumbnail?: string;
  desc?: string;
  runtime?: string;
  video?: SourceVideo;
  season?: number;
  episode?: number;
  /** Index within the item and the item's size. */
  index: number;
  count: number;
  /** Episodes of this source season within the item. */
  seasonCount: number;
  multiSeason: boolean;
}

export type ThumbLabel =
  | { mode: 'tag'; num: string; sub: string; main: string; pos?: string }
  | { mode: 'ribbon'; jp: string; main: string; rt: string };

export interface Labelled {
  title: string;
  /** First words of the description: the TV shows about two lines. */
  lead: string;
  thumb: ThumbLabel;
}

export interface LabelContext {
  g: number;
  group: Group;
  /** Position among the season's main (or optional) entries. */
  pos: number;
  of: number;
  totalTitles: number;
}

export type ThumbStyle = 'ds' | 'mcu' | 'xmen' | 'anime' | 'western';

export interface Franchise {
  id: string;
  name: string;
  style: ThumbStyle;
  releaseInfo: string;
  description: string;
  poster: string;
  background: string;
  /** A logo image URL, or text to render as one. */
  logo: string | { accent: string; rest: string; color?: string };
  groups: Record<number, Group>;
  plan: Array<[number, Item[]]>;
  label: (e: Entry, ctx: LabelContext) => Labelled;
}

export interface PlaylistVideo {
  id: string;
  season: number;
  episode: number;
  title: string;
  released?: string;
  overview: string;
  /** Source image the thumbnail is drawn on. */
  source?: string;
  optional: boolean;
  label: ThumbLabel;
  groupColor: string;
  groupPattern: Pattern;
}

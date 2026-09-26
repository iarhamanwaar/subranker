/**
 * Thumbnail, poster and logo rendering. Loaded only by the builder process:
 * resvg rasterises synchronously, which inside the server would stall every
 * subtitle request queued behind it.
 *
 * satori lays the label out (it wraps text properly), resvg rasterises, sharp
 * encodes. Sizes are fractions of the card width (u = 1%) so the label reads
 * the same at any resolution, and the top-right corner stays clear for
 * Stremio's own "E01" badge.
 */
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import type { Pattern, ThumbLabel, ThumbStyle } from './types.js';

// One render at a time: memory stays flat, and the box has other work to do.
sharp.concurrency(1);
sharp.cache(false);

const W = 640;
const H = 360;
const u = W / 100;
const PANEL = 'rgba(10,8,20,0.82)';

const font = (file: string) => readFileSync(new URL(`../../assets/fonts/${file}`, import.meta.url));
const FONTS = [
  { name: 'Jakarta', data: font('PlusJakartaSans-ExtraBold.ttf'), weight: 800 as const, style: 'normal' as const },
  { name: 'Jakarta', data: font('PlusJakartaSans-Bold.ttf'), weight: 700 as const, style: 'normal' as const },
  { name: 'Anton', data: font('Anton-Regular.ttf'), weight: 400 as const, style: 'normal' as const },
  { name: 'Mincho', data: font('ShipporiMinchoB1-ExtraBold-subset.ttf'), weight: 800 as const, style: 'normal' as const },
];

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown; [k: string]: unknown } };
type Child = Node | string | null | undefined | false;

function h(type: string, style: Record<string, unknown>, ...children: Child[]): Node {
  const kids = children.filter((c): c is Node | string => c != null && c !== false);
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}

/** Numeral block: kanji for anime, a poster-face digit for the MCU, a roman numeral in an X ring. */
function numeral(style: ThumbStyle, num: string, color: string): Node {
  const box = { background: color, minWidth: 12.5 * u, alignItems: 'center', justifyContent: 'center', padding: `${2.5 * u}px ${3 * u}px ${3 * u}px`, color: '#fff' };
  const kanji = /[぀-鿿]/.test(num);
  if (kanji && num.length > 1) {
    // Two-character marks (番外) stack, as vertical writing would.
    return h('div', { ...box, flexDirection: 'column', fontFamily: 'Mincho', fontSize: 4.6 * u, lineHeight: 1.05 }, ...[...num].map((c) => h('span', {}, c)));
  }
  if (kanji) return h('div', { ...box, fontFamily: 'Mincho', fontSize: 7 * u, lineHeight: 1 }, num);
  if (style === 'xmen') {
    const ring = 9 * u;
    const bar = (deg: number) => `linear-gradient(${deg}deg, transparent 46%, rgba(255,255,255,0.28) 46%, rgba(255,255,255,0.28) 54%, transparent 54%)`;
    return h('div', { ...box, position: 'relative', fontFamily: 'Anton', fontSize: 6.6 * u, lineHeight: 1 },
      h('div', { position: 'absolute', width: ring, height: ring, borderRadius: ring, border: `${0.7 * u}px solid rgba(255,255,255,0.35)`, backgroundImage: `${bar(45)}, ${bar(-45)}` }),
      h('span', {}, num));
  }
  return h('div', { ...box, fontFamily: 'Anton', fontSize: 9 * u, lineHeight: 1, paddingTop: 2 * u }, num);
}

const strip = (p: Pattern) => h('div', { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.3 * u, ...p });

function labelNode(style: ThumbStyle, lab: ThumbLabel, color: string, pattern: Pattern): Node {
  if (lab.mode === 'ribbon') {
    return h('div', { position: 'absolute', top: 3 * u, left: 3 * u, alignItems: 'center', padding: `${2.1 * u}px ${4.2 * u}px ${2.9 * u}px ${3.8 * u}px`, borderRadius: 2.5 * u, background: PANEL, overflow: 'hidden', color: '#fff' },
      h('div', { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2 * u, ...pattern }),
      strip(pattern),
      h('span', { fontFamily: 'Mincho', fontSize: 5 * u, opacity: 0.85, marginLeft: 1.2 * u, marginRight: 2.9 * u }, lab.jp),
      h('span', { fontFamily: 'Jakarta', fontWeight: 800, fontSize: 6.3 * u, letterSpacing: 0.63 * u, marginRight: 2.9 * u }, lab.main),
      lab.rt ? h('span', { fontFamily: 'Jakarta', fontWeight: 700, fontSize: 4.6 * u, opacity: 0.75 }, lab.rt) : null);
  }
  return h('div', { position: 'absolute', top: 3 * u, left: 3 * u, maxWidth: 74 * u, borderRadius: 2.5 * u, background: PANEL, overflow: 'hidden', color: '#fff' },
    numeral(style, lab.num, color),
    // An explicit max width: without it satori measures the text on one line
    // and the panel clips the overflow instead of wrapping it.
    h('div', { flexDirection: 'column', justifyContent: 'center', padding: `${2.4 * u}px ${3.6 * u}px ${3.3 * u}px ${3.2 * u}px`, fontFamily: 'Jakarta', maxWidth: 58 * u },
      h('span', { fontWeight: 700, fontSize: 3.4 * u, letterSpacing: 0.41 * u, opacity: 0.72, marginBottom: 0.6 * u, textTransform: 'uppercase' }, lab.sub),
      // Two lines at most. satori's lineClamp crashes in this layout, so the
      // height is capped instead.
      h('div', { fontWeight: 800, fontSize: 4.4 * u, lineHeight: 1.12, maxHeight: 2 * 1.12 * 4.4 * u, overflow: 'hidden', letterSpacing: 0.26 * u, textTransform: 'uppercase' }, lab.main)),
    strip(pattern));
}

async function dataUrl(image: Buffer, w: number, hgt: number): Promise<string> {
  const jpg = await sharp(image).resize(w, hgt, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

const img = (src: string, w: number, hgt: number): Node => ({ type: 'img', props: { src, width: w, height: hgt, style: { position: 'absolute', left: 0, top: 0, width: w, height: hgt } } });

async function toJpeg(tree: Node, w: number, hgt: number, quality: number): Promise<Buffer> {
  const svg = await satori(tree as never, { width: w, height: hgt, fonts: FONTS });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng();
  return sharp(png).jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
}

export async function renderThumb(o: { image?: Buffer; style: ThumbStyle; label: ThumbLabel; color: string; pattern: Pattern }): Promise<Buffer> {
  const tree = h('div', { width: W, height: H, position: 'relative', background: '#262338' },
    o.image ? img(await dataUrl(o.image, W, H), W, H) : null,
    labelNode(o.style, o.label, o.color, o.pattern),
    o.label.mode === 'tag' && o.label.pos
      ? h('div', { position: 'absolute', left: 3 * u, bottom: 3.8 * u, fontFamily: 'Jakarta', fontWeight: 700, fontSize: 4.6 * u, lineHeight: 1, color: '#fff', background: 'rgba(10,8,20,0.72)', padding: `${1.7 * u}px ${2.9 * u}px`, borderRadius: 2 * u, letterSpacing: 0.14 * u }, o.label.pos)
      : null);
  return toJpeg(tree, W, H, 78);
}

/** Playlist poster: WATCH ORDER band whose bottom edge runs every season's pattern in order. */
export async function renderPoster(o: { image: Buffer; patterns: Pattern[] }): Promise<Buffer> {
  const PW = 400, PH = 600, v = PW / 100;
  const tree = h('div', { width: PW, height: PH, position: 'relative', background: '#262338' },
    img(await dataUrl(o.image, PW, PH), PW, PH),
    h('div', { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'column', backgroundImage: 'linear-gradient(0deg, rgba(10,8,20,0.97) 72%, rgba(10,8,20,0))', paddingTop: 12 * v },
      h('span', { fontFamily: 'Jakarta', fontWeight: 800, fontSize: 7.5 * v, letterSpacing: 1.05 * v, color: '#fff', padding: `0 ${6 * v}px ${4 * v}px` }, 'WATCH ORDER'),
      h('div', { height: 4 * v }, ...o.patterns.map((p) => h('div', { flexGrow: 1, height: 4 * v, ...p })))));
  return toJpeg(tree, PW, PH, 84);
}

/** Text logo for franchises without one. PNG with transparency: the TV draws it over the backdrop, and SVG logos crash Android. */
export async function renderLogo(o: { accent: string; rest: string; color?: string }): Promise<Buffer> {
  // Wide canvas, one line, then trimmed to the ink: the TV fits it into its
  // logo slot (333x80dp), so the proportions are what matter.
  const LW = 1800, LH = 240;
  const tree = h('div', { width: LW, height: LH, alignItems: 'center', fontFamily: 'Anton', fontSize: 170, lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' },
    h('span', { color: o.color ?? '#e23636', marginRight: 36 }, o.accent),
    h('span', { color: '#fff' }, o.rest));
  const svg = await satori(tree as never, { width: LW, height: LH, fonts: FONTS });
  return sharp(new Resvg(svg).render().asPng()).trim().png({ compressionLevel: 9 }).toBuffer();
}

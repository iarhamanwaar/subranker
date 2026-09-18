/**
 * The mark.
 *
 * Drawn from the subject rather than decoration: a subtitle cue is a short
 * stack of text lines, so the mark is a stack of caption bars. The top bar is
 * lit and the ones beneath it recede, which is the product stated in one
 * image — a ranked list with the right subtitle first.
 *
 * Served as SVG so it stays sharp at any size and needs no build step or
 * binary in the repository. The manifest previously pointed at a PNG that did
 * not exist, so Stremio showed the addon with no icon at all.
 */

export const LOGO_COLORS = {
  frame: '#0A0B0D',
  top: '#FF3D7F',
  mid: '#F5F6F7',
  low: '#5A6270',
} as const;

/**
 * @param size square canvas in px
 * @param withFrame draw the rounded letterbox plate behind the bars
 */
export function logoSvg(size = 256, withFrame = true): string {
  const c = LOGO_COLORS;
  // Bars sit on a 256 grid: descending width reads as a ranking, and the
  // gap under the top bar gives it emphasis without a second colour trick.
  const bars = [
    { y: 74, w: 148, fill: c.top, o: 1 },
    { y: 122, w: 112, fill: c.mid, o: 0.62 },
    { y: 162, w: 132, fill: c.mid, o: 0.36 },
    { y: 202, w: 84, fill: c.low, o: 0.5 },
  ];

  const plate = withFrame
    ? `<rect width="256" height="256" rx="56" fill="${c.frame}"/>` +
      `<rect x="20" y="20" width="216" height="216" rx="40" fill="none" stroke="${c.top}" stroke-opacity=".18"/>`
    : '';

  const rows = bars
    .map(
      (b) =>
        `<rect x="${(256 - b.w) / 2}" y="${b.y}" width="${b.w}" height="22" rx="11" ` +
        `fill="${b.fill}" fill-opacity="${b.o}"/>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256" role="img" aria-label="SubRanker">${plate}${rows}</svg>`;
}

/**
 * The corrected-subtitle route.
 *
 * `/shift/<offset>/<rate>/<base64url-of-source>.srt` fetches the original file
 * and serves it with every timestamp corrected. The shift travels in the path
 * rather than in server state so the route stays stateless and cacheable.
 */
import { applyShift, type Shift } from './rewrite.js';
import { stripAds } from './ads.js';
import { isFetchableUrl } from '../net.js';

// Re-exported so existing callers and tests keep a single import site.
export { isFetchableUrl };
import { decodeSubtitle } from './encoding.js';
import { cleanupCues } from './cleanup.js';
import { fixOverlaps } from './overlap.js';

export interface ShiftRequest extends Shift {
  url: string;
  /** Cleanups to apply, as a compact flag string: h=HI, u=uppercase, o=OCR. */
  flags?: string;
}

function encodeNumber(n: number): string {
  // Path-safe fixed point: "-2.500" becomes "n2_500".
  const sign = n < 0 ? 'n' : 'p';
  return `${sign}${Math.abs(n).toFixed(3).replace('.', '_')}`;
}

function decodeNumber(s: string): number | null {
  const m = /^([np])(\d+)_(\d{1,3})$/.exec(s);
  if (!m) return null;
  const value = Number(`${m[2]}.${m[3]}`);
  if (!Number.isFinite(value)) return null;
  return m[1] === 'n' ? -value : value;
}

export function buildShiftPath(req: ShiftRequest): string {
  const encoded = Buffer.from(req.url, 'utf8').toString('base64url');
  const flags = req.flags && req.flags.length > 0 ? req.flags : '0';
  return `/shift/${encodeNumber(req.offset)}/${encodeNumber(req.rate)}/${flags}/${encoded}.srt`;
}

export function parseShiftPath(pathname: string): ShiftRequest | null {
  const m = /^\/shift\/([^/]+)\/([^/]+)\/([a-z0]{1,8})\/(.+)\.srt$/.exec(pathname);
  if (!m) return null;
  const offset = decodeNumber(m[1]!);
  const rate = decodeNumber(m[2]!);
  if (offset === null || rate === null || rate <= 0) return null;

  let url: string;
  try {
    url = Buffer.from(m[4]!, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!isFetchableUrl(url)) return null;
  return { offset, rate, url, flags: m[3]! };
}


/** Redirect hops to follow before giving up. */
const MAX_REDIRECTS = 4;

export async function fetchShifted(req: ShiftRequest, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let url = req.url;

    // Redirects are followed manually and every hop is re-validated. Letting
    // fetch follow them would defeat the check on the initial URL: a public
    // host can redirect to 127.0.0.1 or the cloud metadata endpoint, and the
    // response body would be handed straight back to the caller.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isFetchableUrl(url)) return null;

      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; subranker/0.1)' },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return null;
        url = new URL(location, url).toString();
        continue;
      }

      if (!res.ok) return null;
      // res.text() would assume UTF-8 and mangle legacy encodings, so the
      // bytes are decoded explicitly. What we serve is always UTF-8.
      const buf = Buffer.from(await res.arrayBuffer());
      const { text } = decodeSubtitle(buf);
      // Banners are removed before shifting: they sit outside the real
      // timeline, so dropping them first keeps the cue numbering clean.
      let cleaned = stripAds(text).content;
      const flags = req.flags ?? '0';
      cleaned = cleanupCues(cleaned, {
        removeHearingImpaired: flags.includes('h'),
        fixUppercase: flags.includes('u'),
        fixOcr: flags.includes('o'),
      }).content;
      // Overlaps are merged last: the cleanups above can delete a cue
      // entirely, which may remove the collision without any merging.
      if (flags.includes('v')) cleaned = fixOverlaps(cleaned).content;
      return applyShift(cleaned, { offset: req.offset, rate: req.rate });
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

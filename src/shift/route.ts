/**
 * The corrected-subtitle route.
 *
 * `/shift/<offset>/<rate>/<base64url-of-source>.srt` fetches the original file
 * and serves it with every timestamp corrected. The shift travels in the path
 * rather than in server state so the route stays stateless and cacheable.
 */
import { applyShift, type Shift } from './rewrite.js';

export interface ShiftRequest extends Shift {
  url: string;
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
  return `/shift/${encodeNumber(req.offset)}/${encodeNumber(req.rate)}/${encoded}.srt`;
}

export function parseShiftPath(pathname: string): ShiftRequest | null {
  const m = /^\/shift\/([^/]+)\/([^/]+)\/(.+)\.srt$/.exec(pathname);
  if (!m) return null;
  const offset = decodeNumber(m[1]!);
  const rate = decodeNumber(m[2]!);
  if (offset === null || rate === null || rate <= 0) return null;

  let url: string;
  try {
    url = Buffer.from(m[3]!, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!isFetchableUrl(url)) return null;
  return { offset, rate, url };
}

/**
 * Only public http(s) URLs may be fetched.
 *
 * This route takes a URL from the request, so without a check it would be an
 * open proxy into anything the server can reach — cloud metadata endpoints and
 * services on the loopback interface included. This box runs unrelated
 * production services, so the check is not optional.
 */
export function isFetchableUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;

  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  if (host === '169.254.169.254') return false; // cloud instance metadata

  // Literal private / loopback / link-local addresses.
  if (/^(127|10)\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === '0.0.0.0' || host === '::1' || host.startsWith('[::1')) return false;

  return true;
}

export async function fetchShifted(req: ShiftRequest, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(req.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; subranker/0.1)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return applyShift(text, { offset: req.offset, rate: req.rate });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

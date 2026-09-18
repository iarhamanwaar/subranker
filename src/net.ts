/**
 * Outbound-request safety.
 *
 * Two routes take a URL from the caller: the repaired-subtitle route takes the
 * source file, and a URL config names its own upstream addons. Both cause the
 * server to make a request on the caller's behalf, so both need the same
 * check — without it this is an open proxy into whatever the host can reach,
 * which on a shared box means unrelated production services and, on a cloud
 * instance, the metadata endpoint that hands out credentials.
 */

/** Only public http(s) URLs may be fetched on a caller's behalf. */
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

  // Literal private, loopback and link-local addresses.
  if (/^(127|10)\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === '0.0.0.0' || host === '::1' || host.startsWith('[::1')) return false;

  return true;
}

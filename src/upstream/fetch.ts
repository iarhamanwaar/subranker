/**
 * Upstream fetching.
 *
 * More than one upstream can be configured, and they are queried in parallel
 * and merged. That is not only about volume: providers expose different
 * metadata, and the difference matters. OpenSubtitles V3+ reports `moviehash`,
 * which is the strongest possible match signal, while SubSense aggregates ten
 * sources but reports no hash at all. Querying both gets the breadth of one
 * and the certainty of the other.
 */
import type { RawSubtitle } from '../types.js';

export interface UpstreamResult {
  subtitles: RawSubtitle[];
  /** Upstreams that answered successfully. */
  ok: string[];
  /** Upstreams that failed, with the reason. */
  failed: Array<{ base: string; error: string }>;
}

function shortName(base: string): string {
  try {
    return new URL(base).hostname.replace(/^www\./, '').split('.')[0] ?? base;
  } catch {
    return base;
  }
}

async function fetchOne(
  base: string,
  path: string,
  timeoutMs: number,
): Promise<{ base: string; subtitles?: RawSubtitle[]; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal });
    if (!res.ok) return { base, error: `HTTP ${res.status}` };
    const payload = (await res.json()) as { subtitles?: RawSubtitle[] };
    const subtitles = Array.isArray(payload.subtitles) ? payload.subtitles : [];
    // Tag provenance so a later failure can be traced to its source, and so
    // ids stay unique once several upstreams are merged.
    const tag = shortName(base);
    return {
      base,
      subtitles: subtitles.map((s) => ({
        ...s,
        id: `${tag}:${s.id}`,
        upstream: tag,
      })),
    };
  } catch (err) {
    return { base, error: err instanceof Error ? err.name : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Query every upstream and merge the results.
 *
 * A failing upstream is reported but never fatal — one provider being down
 * should degrade the list, not empty it.
 */
export async function fetchUpstreams(
  bases: string[],
  path: string,
  timeoutMs = 20000,
): Promise<UpstreamResult> {
  const results = await Promise.all(bases.map((b) => fetchOne(b, path, timeoutMs)));

  const subtitles: RawSubtitle[] = [];
  const seen = new Set<string>();
  const ok: string[] = [];
  const failed: Array<{ base: string; error: string }> = [];

  for (const r of results) {
    if (r.error !== undefined || !r.subtitles) {
      failed.push({ base: r.base, error: r.error ?? 'no subtitles' });
      continue;
    }
    ok.push(r.base);
    for (const s of r.subtitles) {
      // Deduplicate on URL: upstreams overlap heavily, and the same file
      // appearing twice wastes a verification slot and a row in the list.
      const key = s.url;
      if (seen.has(key)) continue;
      seen.add(key);
      subtitles.push(s);
    }
  }

  return { subtitles, ok, failed };
}

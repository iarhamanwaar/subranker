/**
 * Candidate download and inspection.
 *
 * Measured against the live setup, roughly half of one upstream provider's
 * links return 404 from both a home connection and a datacenter, so a dead-link
 * check is the single cheapest quality win available. Separately,
 * dl.opensubtitles.org answers 200 from a residential IP and 403 from AWS, so
 * a failure here does not always mean the link is bad for the *client* — those
 * are marked unverified rather than dropped.
 */
import type { Verification } from '../types.js';
import { align, parseTimeline, type Timeline } from './cues.js';
import { stripAds } from '../shift/ads.js';
import { decodeSubtitle } from '../shift/encoding.js';
import { cleanupCues } from '../shift/cleanup.js';

/** Statuses that indicate the server refused us specifically, not a dead link. */
const IP_BLOCK_STATUSES = new Set([401, 403, 429]);

export interface FetchOptions {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
}

export const DEFAULT_FETCH_OPTIONS: FetchOptions = {
  timeoutMs: 6000,
  maxBytes: 2_000_000,
  userAgent: 'Mozilla/5.0 (compatible; subranker/0.1)',
};

export interface Fetched {
  verification: Verification;
  timeline: Timeline;
  /** True when the failure looks like datacenter blocking rather than a dead link. */
  blocked: boolean;
}

export async function fetchAndInspect(
  url: string,
  options: FetchOptions = DEFAULT_FETCH_OPTIONS,
): Promise<Fetched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': options.userAgent },
    });

    if (!res.ok) {
      return {
        verification: { ok: false, status: res.status, error: `HTTP ${res.status}` },
        timeline: [],
        blocked: IP_BLOCK_STATUSES.has(res.status),
      };
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > options.maxBytes) {
      return {
        verification: { ok: false, status: res.status, error: 'oversized', bytes: buf.byteLength },
        timeline: [],
        blocked: false,
      };
    }

    // Decoded properly rather than assumed UTF-8: ~14% of files sampled from
    // this upstream are in a legacy encoding, and a lossy decode would corrupt
    // the cue text we then search for advertising patterns.
    const decoded = decodeSubtitle(Buffer.from(buf));
    const text = decoded.text;
    const timeline = parseTimeline(text);

    if (timeline.length === 0) {
      return {
        verification: {
          ok: false,
          status: res.status,
          error: 'no cues',
          bytes: buf.byteLength,
          cueCount: 0,
        },
        timeline: [],
        blocked: false,
      };
    }

    return {
      verification: {
        ok: true,
        status: res.status,
        bytes: buf.byteLength,
        cueCount: timeline.length,
        firstCue: timeline[0],
        lastCue: timeline[timeline.length - 1],
        // Counted here because we already hold the content; re-downloading
        // later just to look for banners would double every request.
        adCues: stripAds(text).removed,
        encoding: decoded.encoding,
        encodingRepaired: decoded.repaired,
        ...(function () {
          // Measured here for the same reason as the ad count: the content is
          // already in hand, so a second download would be pure waste.
          const c = cleanupCues(text, {
            removeHearingImpaired: true,
            fixUppercase: true,
            fixOcr: true,
          });
          return { hiCues: c.hiCuesChanged, allCaps: c.uppercaseFixed, ocrCues: c.ocrFixed };
        })(),
      },
      timeline,
      blocked: false,
    };
  } catch (err) {
    const error = err instanceof Error ? err.name : 'error';
    return {
      verification: { ok: false, status: null, error },
      timeline: [],
      // A timeout is ambiguous; treat it as blocked so we do not delete a
      // candidate that the TV might fetch perfectly well.
      blocked: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Attach alignment figures to a verification, given a reference timeline. */
export function withAlignment(
  verification: Verification,
  timeline: Timeline,
  reference: Timeline,
): Verification {
  if (!verification.ok || reference.length === 0) return verification;
  const a = align(timeline, reference);
  return { ...verification, offset: a.offset, rate: a.rate, agreement: a.agreement };
}

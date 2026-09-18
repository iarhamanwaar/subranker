/**
 * Shared types.
 *
 * `RawSubtitle` is what an upstream Stremio subtitle addon returns. The Stremio
 * protocol only guarantees `id`, `url` and `lang`; everything else is a
 * non-standard extra that some addons (notably AIOStreams) attach and that
 * clients ignore. We read those extras because they are useful, but we never
 * depend on them being present.
 */
export interface RawSubtitle {
  id: string;
  url: string;
  lang: string;
  /** Non-standard extras. Present on some addons, absent on others. */
  label?: string;
  releaseName?: string;
  fileName?: string;
  source?: string;
  moviehash?: string | boolean;
  title?: string;
  /** Which configured upstream produced this entry. */
  upstream?: string;
  [key: string]: unknown;
}

/** The extras Stremio may append to a subtitle request. All optional. */
export interface RequestExtras {
  /** OpenSubtitles moviehash of the file being played. */
  videoHash?: string;
  /** Size of the file being played, in bytes. */
  videoSize?: number;
  /** Filename of the stream being played, e.g. "[Erai-raws] Kimetsu no Yaiba-01-1080p.mkv". */
  filename?: string;
}

/** Structured properties extracted from a release name. */
export interface ParsedRelease {
  title?: string;
  season?: number;
  episode?: number;
  year?: number;
  resolution?: string;
  /** Broad provenance: bluray | web | hdtv | dvd | cam. */
  source?: string;
  /** Release group / fansub group, normalised to lowercase. */
  group?: string;
  videoCodec?: string;
  /** True when the name advertises SDH / closed captions. */
  sdh: boolean;
  /** True when the name advertises that it is timed to a dub. */
  dub: boolean;
  /** Which parser produced this, for debugging and confidence comparison. */
  parser: 'anime' | 'general' | 'none';
  /** How many meaningful fields were extracted. Used to pick between parsers. */
  confidence: number;
}

/** A subtitle candidate with everything we have learned about it. */
export interface Candidate {
  raw: RawSubtitle;
  parsed: ParsedRelease;
  /** The best human-readable release string we could find for this candidate. */
  releaseText: string;
  score: number;
  /** Human-readable reasons, highest-impact first. Surfaced in the label. */
  reasons: string[];
  /** Set when the candidate is removed rather than ranked. */
  dropped?: string;
  verification?: Verification;
}

/** Result of downloading and inspecting a candidate's actual file. */
export interface Verification {
  /** Whether the URL served a usable subtitle file. */
  ok: boolean;
  /** HTTP status, or null when the request failed before a response. */
  status: number | null;
  /** Reason it was unusable, when `ok` is false. */
  error?: string;
  bytes?: number;
  cueCount?: number;
  /** Seconds at which the first real dialogue cue starts. */
  firstCue?: number;
  /** Seconds at which the last cue starts. */
  lastCue?: number;
  /** Offset in seconds relative to the reference timeline (positive = late). */
  offset?: number;
  /**
   * Ratio of this timeline to the reference. ~1.0 is fine; ~1.0427 indicates a
   * 23.976 vs 25 fps mismatch, which drifts progressively.
   */
  rate?: number;
  /** Fraction of cues that line up with the reference after alignment. */
  agreement?: number;
  /** Promotional cues detected in the file. */
  adCues?: number;
  /** Encoding the bytes were actually in. */
  encoding?: string;
  /** True when the text had to be repaired to be readable. */
  encodingRepaired?: boolean;
  /** Cues carrying hearing-impaired annotations. */
  hiCues?: number;
  /** True when the file is written entirely in capitals. */
  allCaps?: boolean;
  /** Cues containing repairable OCR damage. */
  ocrCues?: number;
}

/**
 * Timestamp rewriting.
 *
 * Detecting that a subtitle is 2.5s late or drifting at 25/23.976 is only half
 * the job — the viewer still has to fix it by hand. Since alignment already
 * produces `offset` and `rate`, applying them is arithmetic on the cue times,
 * and the corrected file can be served in place of the original.
 *
 *     corrected = original * rate + offset
 *
 * `rate` handles progressive drift from a framerate mismatch, which no amount
 * of delay adjustment in the player can fix. `offset` handles a constant lag.
 */

/** Below this, a shift is not worth rewriting a file for. */
export const MIN_SHIFT_SECONDS = 0.3;

/** Below this deviation from 1.0, treat the rate as clean. */
export const MIN_RATE_DEVIATION = 0.002;

export interface Shift {
  offset: number;
  rate: number;
}

export function isShiftWorthApplying({ offset, rate }: Shift): boolean {
  return Math.abs(offset) >= MIN_SHIFT_SECONDS || Math.abs(rate - 1) >= MIN_RATE_DEVIATION;
}

/**
 * Largest offset still treated as a fixable lag.
 *
 * Beyond this the two files are not the same cut — a different edit, or an
 * opening/recap present in one and not the other — and sliding the whole
 * timeline would not make them match, it would only hide that fact. Measured
 * on real data: honest corrections land within a few seconds, while a
 * mismatched cut produced a 134-second "fix".
 */
export const MAX_APPLY_OFFSET_SECONDS = 30;

/** Minimum agreement before a measured shift is trusted enough to apply. */
export const MIN_APPLY_AGREEMENT = 0.5;

/**
 * Whether a measured shift should actually be applied to the file.
 *
 * Deliberately stricter than `isShiftWorthApplying`: that asks "is this
 * non-trivial", this asks "do we believe it".
 */
export function isShiftSafeToApply(shift: Shift, agreement: number | undefined): boolean {
  if (!isShiftWorthApplying(shift)) return false;
  if (Math.abs(shift.offset) > MAX_APPLY_OFFSET_SECONDS) return false;
  if (agreement === undefined || agreement < MIN_APPLY_AGREEMENT) return false;
  return true;
}

function clamp(seconds: number): number {
  return seconds < 0 ? 0 : seconds;
}

function formatSrt(seconds: number): string {
  const s = clamp(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
}

function formatVtt(seconds: number): string {
  return formatSrt(seconds).replace(',', '.');
}

function formatAss(seconds: number): string {
  const s = clamp(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(sec)}.${pad(cs)}`;
}

function toSeconds(h: string, m: string, s: string, frac: string, fracDigits: number): number {
  const scale = fracDigits === 2 ? 100 : 1000;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(frac) / scale;
}

/**
 * Apply a shift to every timestamp in an SRT, VTT or ASS/SSA file.
 *
 * Only timestamps are touched; cue text, styling and headers pass through
 * unchanged, so an ASS file keeps its typesetting.
 */
export function applyShift(content: string, { offset, rate }: Shift): string {
  const map = (seconds: number) => seconds * rate + offset;

  // ASS/SSA and SRT/VTT are handled separately rather than by one pass: ASS
  // centiseconds (0:00:25.37) would otherwise be matched by the SRT pattern and
  // silently rewritten into SRT format, corrupting the file.
  if (/^\s*Dialogue:/m.test(content)) {
    return content.replace(
      /(^Dialogue:[^\n]*)$/gm,
      (line) =>
        line.replace(
          /(\d):(\d{2}):(\d{2})\.(\d{2})/g,
          (_all, h: string, m: string, s: string, cs: string) =>
            formatAss(map(toSeconds(h, m, s, cs, 2))),
        ),
    );
  }

  // SRT (00:00:25,370) and VTT (00:00:25.370) — always three fractional digits.
  return content.replace(
    /(\d{1,2}):(\d{2}):(\d{2})([.,])(\d{3})/g,
    (_all, h: string, m: string, s: string, sep: string, frac: string) => {
      const seconds = map(toSeconds(h, m, s, frac, 3));
      return sep === ',' ? formatSrt(seconds) : formatVtt(seconds);
    },
  );
}

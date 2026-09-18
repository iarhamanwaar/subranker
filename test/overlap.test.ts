import { describe, expect, it } from 'vitest';
import { countOverlaps, detectDashStyle, fixOverlaps, mergeOverlaps, parseCues } from '../src/shift/overlap.js';

describe('mergeOverlaps', () => {
  it('combines two cues that share screen time', () => {
    // The real case: a sign and a line of dialogue competing for the same line.
    const out = mergeOverlaps([
      { start: 747.26, end: 749.52, text: 'DESTROY DEMONS' },
      { start: 747.85, end: 748.93, text: 'A sword?' },
    ]);
    expect(countOverlaps(out)).toBe(0);
    const both = out.find((c) => c.text.includes('\n'));
    expect(both?.text).toBe('DESTROY DEMONS\nA sword?');
    // The sign is still on screen either side of the dialogue.
    expect(out[0]!.text).toBe('DESTROY DEMONS');
    expect(out[out.length - 1]!.text).toBe('DESTROY DEMONS');
  });

  it('loses no text', () => {
    const out = mergeOverlaps([
      { start: 0, end: 5, text: 'one' },
      { start: 2, end: 7, text: 'two' },
    ]);
    const all = out.map((c) => c.text).join('\n');
    expect(all).toContain('one');
    expect(all).toContain('two');
  });

  it('leaves a non-overlapping list alone', () => {
    const cues = [
      { start: 0, end: 2, text: 'a' },
      { start: 2, end: 4, text: 'b' },
    ];
    expect(mergeOverlaps(cues)).toEqual(cues);
  });

  it('does not fragment a long cue interrupted by a short one', () => {
    const out = mergeOverlaps([
      { start: 0, end: 10, text: 'long' },
      { start: 4, end: 5, text: 'short' },
    ]);
    // long / long+short / long — three spans, not more. The middle span has
    // two simultaneous lines, so it takes the speaker dashes.
    expect(out).toHaveLength(3);
    expect(out[0]!.text).toBe('long');
    expect(out[1]!.text).toBe('-long\n-short');
    expect(out[2]!.text).toBe('long');
  });

  it('ignores sub-frame overlaps that are just rounding', () => {
    const cues = [
      { start: 0, end: 2.0, text: 'a' },
      { start: 1.99, end: 4, text: 'b' },
    ];
    expect(countOverlaps(cues)).toBe(0);
  });

  it('handles three cues at once', () => {
    const out = mergeOverlaps([
      { start: 0, end: 6, text: 'a' },
      { start: 1, end: 6, text: 'b' },
      { start: 2, end: 6, text: 'c' },
    ]);
    expect(countOverlaps(out)).toBe(0);
    expect(out[out.length - 1]!.text).toBe('-a\n-b\n-c');
  });
});

describe('fixOverlaps', () => {
  const SRT = `1
00:12:27,260 --> 00:12:29,520
DESTROY DEMONS

2
00:12:27,850 --> 00:12:28,930
A sword?
`;

  it('rewrites an SRT file so nothing overlaps', () => {
    const r = fixOverlaps(SRT);
    expect(r.merged).toBe(1);
    expect(countOverlaps(parseCues(r.content)!)).toBe(0);
    expect(r.content).toContain('DESTROY DEMONS\nA sword?');
  });

  it('leaves a clean file byte-identical', () => {
    const clean = '1\n00:00:01,000 --> 00:00:02,000\nhi\n';
    expect(fixOverlaps(clean)).toEqual({ content: clean, merged: 0 });
  });

  it('leaves ASS untouched: overlap there is deliberate typesetting', () => {
    const ass = 'Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,{\\pos(9,9)}sign\n';
    expect(fixOverlaps(ass).merged).toBe(0);
  });
});

describe('two characters speaking at once', () => {
  it('marks each speaker with a dash, the usual subtitle convention', () => {
    const out = mergeOverlaps([
      { start: 10, end: 12, text: 'Get back!' },
      { start: 10.2, end: 12.2, text: "I can't!" },
    ]);
    const both = out.find((c) => c.text.includes('\n'));
    // Without the dashes the two lines read as one run-on sentence.
    expect(both?.text).toBe("-Get back!\n-I can't!");
    expect(countOverlaps(out)).toBe(0);
  });

  it('does not dash a sign stacked above dialogue', () => {
    const out = mergeOverlaps([
      { start: 747.26, end: 749.52, text: 'DESTROY DEMONS' },
      { start: 747.85, end: 748.93, text: 'A sword?' },
    ]);
    const both = out.find((c) => c.text.includes('\n'));
    expect(both?.text).toBe('DESTROY DEMONS\nA sword?');
  });

  it('leaves lines that already carry dashes alone', () => {
    const out = mergeOverlaps([
      { start: 0, end: 3, text: '- Hello there' },
      { start: 1, end: 3, text: '- Hi' },
    ]);
    const both = out.find((c) => c.text.includes('\n'));
    expect(both?.text).toBe('- Hello there\n- Hi');
  });

  it('does not dash lyrics', () => {
    const out = mergeOverlaps([
      { start: 0, end: 4, text: '♪ Hold me closer ♪' },
      { start: 1, end: 4, text: 'What are you singing?' },
    ]);
    const both = out.find((c) => c.text.includes('\n'));
    expect(both?.text).toBe('♪ Hold me closer ♪\nWhat are you singing?');
  });
});

describe('dash style matches the file', () => {
  it('detects a file that uses a space after the dash', () => {
    expect(detectDashStyle('- Hello\n- Hi\n- There\n')).toBe('- ');
  });

  it('detects a file that uses no space', () => {
    expect(detectDashStyle('-Hello\n-Hi\n-There\n')).toBe('-');
  });

  it('defaults to the Netflix English form when the file has neither', () => {
    expect(detectDashStyle('Hello there\nHow are you\n')).toBe('-');
  });

  it('follows the file rather than imposing a house style', () => {
    const spaced = mergeOverlaps(
      [
        { start: 0, end: 3, text: 'Get back!' },
        { start: 1, end: 3, text: "I can't!" },
      ],
      '- ',
    );
    expect(spaced.find((c) => c.text.includes('\n'))?.text).toBe("- Get back!\n- I can't!");
  });
});

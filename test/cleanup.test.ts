import { describe, expect, it } from 'vitest';
import {
  cleanupCues,
  fixOcrErrors,
  isAllCaps,
  stripHearingImpaired,
  toSentenceCase,
} from '../src/shift/cleanup.js';

const ALL: Parameters<typeof cleanupCues>[1] = {
  removeHearingImpaired: true,
  fixUppercase: true,
  fixOcr: true,
};

describe('stripHearingImpaired', () => {
  it('removes bracketed sound descriptions', () => {
    expect(stripHearingImpaired('[DOOR CREAKS]\nWho is there?')).toBe('Who is there?');
    expect(stripHearingImpaired('( Panting )')).toBeNull();
  });

  it('removes speaker labels', () => {
    expect(stripHearingImpaired('DOCTOR: Rose!')).toBe('Rose!');
    expect(stripHearingImpaired('MAN 2: Over here.')).toBe('Over here.');
  });

  it('returns null when only sound description remains, so the cue can be dropped', () => {
    expect(stripHearingImpaired('( footsteps crunching )')).toBeNull();
    expect(stripHearingImpaired('[MUSIC PLAYING]')).toBeNull();
  });

  it('leaves ordinary dialogue untouched', () => {
    expect(stripHearingImpaired('How did this happen?')).toBe('How did this happen?');
  });

  it('does not eat an unbalanced bracket in dialogue', () => {
    // Unbalanced brackets occur in real dialogue and in fansub typesetting.
    expect(stripHearingImpaired('He said (and I quote')).toBe('He said (and I quote');
  });

  it('keeps a lyric line that carries actual words', () => {
    expect(stripHearingImpaired('♪ Hold me closer ♪')).toBe('♪ Hold me closer ♪');
  });
});

describe('isAllCaps / toSentenceCase', () => {
  it('detects a file written entirely in capitals', () => {
    const lines = Array.from({ length: 40 }, () => 'THIS IS SHOUTING DIALOGUE FOR A WHOLE FILE');
    expect(isAllCaps(lines)).toBe(true);
  });

  it('does not flag a file with one emphatic line', () => {
    const lines = Array.from({ length: 40 }, (_, i) => (i === 0 ? 'STOP!' : 'this is ordinary dialogue text'));
    expect(isAllCaps(lines)).toBe(false);
  });

  it('ignores files with too little text to judge', () => {
    expect(isAllCaps(['HI'])).toBe(false);
  });

  it('converts shouting to sentence case and preserves I', () => {
    expect(toSentenceCase('I TOLD YOU. GET OUT!')).toBe('I told you. Get out!');
  });
});

describe('fixOcrErrors', () => {
  it('repairs the classic l/I confusion', () => {
    expect(fixOcrErrors("l'm fine")).toBe("I'm fine");
    expect(fixOcrErrors('l can see')).toBe('I can see');
    expect(fixOcrErrors("lt's over")).toBe("It's over");
  });

  it('repairs rn/m confusion in known words', () => {
    expect(fixOcrErrors('corne horne')).toBe('come home');
  });

  it('leaves correct text alone', () => {
    expect(fixOcrErrors('I lost my little lamp')).toBe('I lost my little lamp');
  });
});

describe('cleanupCues', () => {
  const SDH = `1
00:00:01,000 --> 00:00:03,000
[DOOR CREAKS]

2
00:00:04,000 --> 00:00:06,000
DOCTOR: Are you all right?

3
00:00:07,000 --> 00:00:09,000
Yes, l think so.
`;

  it('drops sound-only cues, strips labels and renumbers', () => {
    const r = cleanupCues(SDH, ALL);
    expect(r.content).not.toContain('DOOR CREAKS');
    expect(r.content).not.toContain('DOCTOR:');
    expect(r.content).toContain('Are you all right?');
    expect(r.content).toContain('Yes, I think so.');
    const numbers = r.content.split('\n').filter((l) => /^\d+$/.test(l.trim()));
    expect(numbers).toEqual(['1', '2']);
  });

  it('reports what it changed', () => {
    const r = cleanupCues(SDH, ALL);
    expect(r.hiCuesChanged).toBeGreaterThan(0);
    expect(r.ocrFixed).toBeGreaterThan(0);
  });

  it('does nothing when every option is off', () => {
    expect(cleanupCues(SDH, { removeHearingImpaired: false, fixUppercase: false, fixOcr: false }).content).toBe(SDH);
  });

  it('leaves ASS files untouched, styling and all', () => {
    // Bazarr#2175: their HI removal converts ASS to SRT and destroys styling.
    const ass = 'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\pos(9,9)}[DOOR CREAKS]\n';
    const r = cleanupCues(ass, ALL);
    expect(r.content).toBe(ass);
    expect(r.hiCuesChanged).toBe(0);
  });
});

describe('forced-subtitle detection', () => {
  it('spots a forced track by name', async () => {
    const { detectForced, isForced } = await import('../src/parse/forced.js');
    expect(isForced(detectForced('Movie.2020.1080p.BluRay.FORCED'))).toBe(true);
    expect(isForced(detectForced('Movie.2020.Signs.and.Songs'))).toBe(true);
  });

  it('spots a forced track by cue density regardless of its name', async () => {
    const { detectForced, isForced } = await import('../src/parse/forced.js');
    // A 100-minute film with 40 cues is covering signs, not dialogue.
    const v = { ok: true, status: 200, cueCount: 40, firstCue: 60, lastCue: 6000 };
    expect(isForced(detectForced('Ordinary.Name.1080p', v))).toBe(true);
  });

  it('does not flag a normal full subtitle', async () => {
    const { detectForced, isForced } = await import('../src/parse/forced.js');
    const v = { ok: true, status: 200, cueCount: 900, firstCue: 25, lastCue: 6000 };
    expect(isForced(detectForced('Ordinary.Name.1080p', v))).toBe(false);
  });

  it('does not flag a short clip with few cues', async () => {
    const { detectForced, isForced } = await import('../src/parse/forced.js');
    // Span under the minimum, so a low cue count means nothing.
    const v = { ok: true, status: 200, cueCount: 30, firstCue: 10, lastCue: 300 };
    expect(isForced(detectForced('Clip', v))).toBe(false);
  });
});

describe('speaker-label false positives', () => {
  it('does not eat a title card ending in a colon', async () => {
    const { stripHearingImpaired } = await import('../src/shift/cleanup.js');
    // Observed on a real file: "EPISODE 1:\nCRUELTY" lost its first line.
    expect(stripHearingImpaired('EPISODE 1:\nCRUELTY')).toBe('EPISODE 1:\nCRUELTY');
    expect(stripHearingImpaired('CHAPTER 3:\nThe Return')).toBe('CHAPTER 3:\nThe Return');
  });

  it('still strips a real speaker label', async () => {
    const { stripHearingImpaired } = await import('../src/shift/cleanup.js');
    expect(stripHearingImpaired('DOCTOR: Rose!')).toBe('Rose!');
  });
});

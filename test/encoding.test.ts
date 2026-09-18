import { describe, expect, it } from 'vitest';
import { decodeSubtitle } from '../src/shift/encoding.js';

describe('decodeSubtitle', () => {
  it('passes clean UTF-8 through untouched', () => {
    const r = decodeSubtitle(Buffer.from('Nezuko, don’t die on me.', 'utf-8'));
    expect(r.text).toBe('Nezuko, don’t die on me.');
    expect(r.repaired).toBe(false);
    expect(r.encoding).toBe('utf-8');
  });

  it('strips a UTF-8 BOM', () => {
    const r = decodeSubtitle(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('1\n', 'utf-8')]));
    expect(r.text.startsWith('1')).toBe(true);
  });

  it('decodes a Windows-1252 file that is not valid UTF-8', () => {
    // "café" in Windows-1252: the é is a single 0xE9 byte, invalid as UTF-8.
    const buf = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x69, 0x73, 0x20, 0x6f, 0x70, 0x65, 0x6e]);
    const r = decodeSubtitle(buf);
    expect(r.text).toContain('café');
    expect(r.repaired).toBe(true);
  });

  it('repairs double-encoded text that is technically valid UTF-8', () => {
    // What a player shows when UTF-8 was decoded as Latin-1 upstream.
    const broken = 'cafÃ© au lait';
    const r = decodeSubtitle(Buffer.from(broken, 'utf-8'));
    expect(r.text).toBe('café au lait');
    expect(r.repaired).toBe(true);
    expect(r.encoding).toContain('double-encoded');
  });

  it('repairs mangled smart quotes', () => {
    const r = decodeSubtitle(Buffer.from('donâ€™t die', 'utf-8'));
    expect(r.text).toBe('don’t die');
  });

  it('does not "repair" text that is already correct', () => {
    // Applying the Latin-1 round trip to good text would destroy it.
    const good = 'Größe und Straße — naïve café';
    const r = decodeSubtitle(Buffer.from(good, 'utf-8'));
    expect(r.text).toBe(good);
    expect(r.repaired).toBe(false);
  });

  it('keeps ordinary ASCII dialogue intact', () => {
    const srt = '1\n00:00:25,370 --> 00:00:26,460\nHow?\n';
    expect(decodeSubtitle(Buffer.from(srt, 'utf-8')).text).toBe(srt);
  });
});

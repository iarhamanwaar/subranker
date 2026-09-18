import { describe, expect, it } from 'vitest';
import { capPerLanguage } from '../src/pipeline.js';

const row = (lang: string, id: string) => ({ raw: { lang, id } });

describe('capPerLanguage', () => {
  it('keeps the cap per language rather than across the whole list', () => {
    // The shape that broke it live: ranking interleaves languages, so a global
    // slice of 6 took Spanish/Portuguese/Greek and left no English at all.
    const ordered = [
      row('spa', 's1'), row('por', 'p1'), row('ell', 'g1'),
      row('por', 'p2'), row('por', 'p3'), row('slo', 'k1'),
      row('eng', 'e1'), row('eng', 'e2'),
    ];
    const kept = capPerLanguage(ordered, 2);
    expect(kept.filter((r) => r.raw.lang === 'eng')).toHaveLength(2);
    expect(kept.filter((r) => r.raw.lang === 'por')).toHaveLength(2);
    expect(kept.map((r) => r.raw.id)).toEqual(['s1', 'p1', 'g1', 'p2', 'k1', 'e1', 'e2']);
  });

  it('preserves rank order within a language', () => {
    const kept = capPerLanguage([row('eng', 'a'), row('eng', 'b'), row('eng', 'c')], 2);
    expect(kept.map((r) => r.raw.id)).toEqual(['a', 'b']);
  });

  it('behaves like a global cap when every row is one language', () => {
    const ordered = Array.from({ length: 10 }, (_, i) => row('eng', String(i)));
    expect(capPerLanguage(ordered, 6)).toHaveLength(6);
  });

  it('does not treat distinct languages as one group', () => {
    const ordered = [row('eng', 'a'), row('spa', 'b'), row('eng', 'c'), row('spa', 'd')];
    expect(capPerLanguage(ordered, 1).map((r) => r.raw.id)).toEqual(['a', 'b']);
  });
});

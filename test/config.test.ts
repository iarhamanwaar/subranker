import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = { UPSTREAM_BASE: 'https://example.invalid' };

describe('loadConfig language preference', () => {
  it("defaults to English, expanded to the codes providers use", () => {
    const c = loadConfig(base);
    expect(c.langPref).toEqual(expect.arrayContaining(['en', 'eng', 'english']));
    expect(c.dropOtherLangs).toBe(true);
  });

  it('expands a 2-letter pref and honours DROP_OTHER_LANGS=false', () => {
    const c = loadConfig({ ...base, LANG_PREF: 'en', DROP_OTHER_LANGS: 'false' });
    expect(c.langPref).toContain('eng');
    expect(c.dropOtherLangs).toBe(false);
  });
});

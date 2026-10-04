import { describe, expect, it } from 'vitest';
import { languageCheck, runtimeCheck } from '../src/harness/oracle.js';
import type { Fixture } from '../src/harness/types.js';

const fx: Fixture = {
  label: 'Demon Slayer S4E4', id: 'tt9335498:4:4',
  filename: 'x.mkv', lang: 'en', expectedRuntimeMax: 3000,
};

describe('runtimeCheck', () => {
  it('passes a normal ~23min episode', () => {
    expect(runtimeCheck([10, 700, 1400], fx).status).toBe('pass');
  });
  it('fails a batch file running over an hour', () => {
    expect(runtimeCheck([10, 1800, 3704], fx).status).toBe('fail');
  });
  it('fails an empty timeline', () => {
    expect(runtimeCheck([], fx).status).toBe('fail');
  });
});

describe('languageCheck', () => {
  it('passes when the top sub is English', () => {
    expect(languageCheck('eng', fx).status).toBe('pass');
  });
  it('fails when the top sub is French (the French-above-English bug)', () => {
    expect(languageCheck('fre', fx).status).toBe('fail');
  });
  it('fails when there is no top sub', () => {
    expect(languageCheck(undefined, fx).status).toBe('fail');
  });
});

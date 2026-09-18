import { describe, expect, it } from 'vitest';
import {
  applyUrlConfig,
  buildInstallPath,
  decodeUrlConfig,
  encodeUrlConfig,
  parseRoute,
} from '../src/config-url.js';
import type { Config } from '../src/config.js';

const BASE: Config = {
  port: 7010,
  upstreamBases: ['https://default.example'],
  relabel: false,
  dropMismatches: true,
  verify: true,
  verifyLimit: 15,
  verifyTimeoutMs: 2500,
  cacheTtl: 3600,
  maxResults: 6,
  publicUrl: 'https://subs.example',
  autoShift: true,
  removeHearingImpaired: true,
  fixUppercase: true,
  fixOcr: true,
  fixOverlaps: true,
  demoteForced: true,
  addonName: 'SubRanker',
  probeLabels: false,
};

describe('encode / decode', () => {
  it('round-trips a config', () => {
    const cfg = { upstreams: ['https://a.example/en'], maxResults: 4, autoShift: false };
    expect(decodeUrlConfig(encodeUrlConfig(cfg))).toMatchObject(cfg);
  });

  it('normalises upstreams, stripping /manifest.json and trailing slashes', () => {
    const decoded = decodeUrlConfig(
      encodeUrlConfig({ upstreams: ['https://a.example/en/manifest.json', 'https://b.example/'] }),
    );
    expect(decoded!.upstreams).toEqual(['https://a.example/en', 'https://b.example']);
  });

  it('rejects a config with no usable upstream', () => {
    expect(decodeUrlConfig(encodeUrlConfig({ upstreams: [] }))).toBeNull();
    expect(decodeUrlConfig(encodeUrlConfig({ upstreams: ['not-a-url'] }))).toBeNull();
  });

  it('rejects junk rather than throwing', () => {
    expect(decodeUrlConfig('not-base64!!')).toBeNull();
    expect(decodeUrlConfig(Buffer.from('[]').toString('base64url'))).toBeNull();
  });

  it('ignores fields of the wrong type instead of trusting them', () => {
    const blob = Buffer.from(
      JSON.stringify({ upstreams: ['https://a.example'], maxResults: 'lots', autoShift: 'yes' }),
    ).toString('base64url');
    const d = decodeUrlConfig(blob)!;
    expect(d.maxResults).toBeUndefined();
    expect(d.autoShift).toBeUndefined();
  });
});

describe('applyUrlConfig', () => {
  it('overrides only what was set', () => {
    const merged = applyUrlConfig(BASE, { upstreams: ['https://x.example'], maxResults: 3 });
    expect(merged.upstreamBases).toEqual(['https://x.example']);
    expect(merged.maxResults).toBe(3);
    // Untouched fields keep the server default rather than resetting.
    expect(merged.autoShift).toBe(true);
    expect(merged.fixOverlaps).toBe(true);
  });

  it('allows switching a feature off', () => {
    const merged = applyUrlConfig(BASE, { upstreams: ['https://x.example'], autoShift: false });
    expect(merged.autoShift).toBe(false);
  });
});

describe('parseRoute', () => {
  const cfg = encodeUrlConfig({ upstreams: ['https://a.example'] });

  it('parses a plain path with no config', () => {
    expect(parseRoute('/manifest.json')).toEqual({ config: null, rank: null, rest: '/manifest.json' });
  });

  it('parses a config segment', () => {
    const r = parseRoute(`/c/${cfg}/subtitles/movie/tt1.json`);
    expect(r.config!.upstreams).toEqual(['https://a.example']);
    expect(r.rest).toBe('/subtitles/movie/tt1.json');
  });

  it('parses a rank segment', () => {
    const r = parseRoute(`/c/${cfg}/r/3/manifest.json`);
    expect(r.rank).toBe(3);
    expect(r.rest).toBe('/manifest.json');
  });

  it('parses a rank segment without a config', () => {
    expect(parseRoute('/r/2/manifest.json').rank).toBe(2);
  });

  it('reports a malformed config as null rather than throwing', () => {
    expect(parseRoute('/c/@@@@/manifest.json').rest).toBe('/c/@@@@/manifest.json');
  });
});

describe('buildInstallPath', () => {
  it('builds a plain install path', () => {
    const p = buildInstallPath({ upstreams: ['https://a.example'] });
    expect(p.startsWith('/c/')).toBe(true);
    expect(p.endsWith('/manifest.json')).toBe(true);
    expect(parseRoute(p).config!.upstreams).toEqual(['https://a.example']);
  });

  it('builds a rank-pinned install path', () => {
    const p = buildInstallPath({ upstreams: ['https://a.example'] }, 2);
    expect(parseRoute(p).rank).toBe(2);
  });
});

describe('upstreams are validated as fetchable', () => {
  it('rejects a config pointing at the host itself', () => {
    // The server fetches these on the caller's behalf, so a config segment
    // would otherwise be an open proxy into the host's own network.
    for (const u of [
      'http://127.0.0.1:7010/x',
      'http://localhost/x',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/x',
      'http://192.168.1.4/x',
    ]) {
      expect(decodeUrlConfig(encodeUrlConfig({ upstreams: [u] })), u).toBeNull();
    }
  });

  it('keeps the public upstreams when a private one is mixed in', () => {
    const d = decodeUrlConfig(
      encodeUrlConfig({ upstreams: ['http://127.0.0.1/x', 'https://ok.example/en'] }),
    );
    expect(d!.upstreams).toEqual(['https://ok.example/en']);
  });
});

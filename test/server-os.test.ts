import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';

async function withServer(
  env: Record<string, string>,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer(createApp(loadConfig(env)));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

describe('/os download proxy security', () => {
  it('404s a file id never surfaced by a search (not an open proxy)', async () => {
    await withServer(
      { UPSTREAM_BASE: 'https://example.invalid', OPENSUBTITLES_API_KEY: 'k', PUBLIC_URL: 'https://subs.example' },
      async (base) => {
        const res = await fetch(`${base}/os/999999.srt`);
        expect(res.status).toBe(404);
        // The error must not be publicly cacheable (no cache poisoning).
        expect(res.headers.get('cache-control')).toBe('no-store');
      },
    );
  });

  it('404s when no API key is configured', async () => {
    await withServer({ UPSTREAM_BASE: 'https://example.invalid' }, async (base) => {
      const res = await fetch(`${base}/os/123.srt`);
      expect(res.status).toBe(404);
    });
  });

  it('404s a SubDL id never surfaced by a search, with no-store', async () => {
    await withServer(
      { UPSTREAM_BASE: 'https://example.invalid', SUBDL_API_KEY: 'k', PUBLIC_URL: 'https://subs.example' },
      async (base) => {
        const res = await fetch(`${base}/subdl/9-9.srt`);
        expect(res.status).toBe(404);
        expect(res.headers.get('cache-control')).toBe('no-store');
      },
    );
  });
});

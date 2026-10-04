/**
 * The harness runner. Replays request fixtures against a running SubRanker
 * instance (local or prod), downloads the top subtitle, and feeds the oracle.
 * Network access is injected so the logic is testable without it.
 *
 * Downloads go to whatever URL the addon returns (subs5.strem.io mirrors),
 * which are not quota-limited. This must never call the OpenSubtitles API.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseTimeline } from '../verify/cues.js';
import { judge } from './oracle.js';
import type { EpisodeReport, Fixture, HarnessReport } from './types.js';

interface Sub {
  id: string;
  url: string;
  lang: string;
  label?: string;
}
interface Deps {
  fetchSubs: (fx: Fixture) => Promise<Sub[]>;
  fetchText: (url: string) => Promise<string>;
}

export function subPath(fx: Fixture): string {
  const id = encodeURIComponent(fx.id);
  const parts = [`filename=${encodeURIComponent(fx.filename)}`];
  if (fx.videoSize) parts.push(`videoSize=${fx.videoSize}`);
  if (fx.videoHash) parts.push(`videoHash=${fx.videoHash}`);
  return `/subtitles/series/${id}/${parts.join('&')}.json`;
}

function httpDeps(base: string): Deps {
  return {
    fetchSubs: async (fx) => {
      const res = await fetch(`${base}${subPath(fx)}`, { signal: AbortSignal.timeout(30_000) });
      const data = (await res.json()) as { subtitles?: Sub[] };
      return data.subtitles ?? [];
    },
    fetchText: async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      return res.text();
    },
  };
}

export async function runHarness(fixtures: Fixture[], deps: Deps): Promise<HarnessReport> {
  const episodes: EpisodeReport[] = [];
  for (const fx of fixtures) {
    const subs = await deps.fetchSubs(fx);
    const top = subs[0];
    let timeline: number[] = [];
    if (top) {
      try {
        timeline = parseTimeline(await deps.fetchText(top.url));
      } catch {
        timeline = [];
      }
    }
    const result = judge(fx, top?.lang, timeline);
    episodes.push({
      label: fx.label,
      id: fx.id,
      topLang: top?.lang,
      topUrl: top?.url,
      runtimeSeconds: timeline.at(-1),
      ...result,
    });
  }
  const passed = episodes.filter((e) => e.pass).length;
  return {
    total: episodes.length,
    passed,
    passRate: episodes.length ? passed / episodes.length : 0,
    episodes,
  };
}

// CLI entry: `pnpm harness [fixtures.json]`, HARNESS_BASE overrides the target.
if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.env.HARNESS_BASE ?? 'http://127.0.0.1:7010';
  const path = process.argv[2] ?? 'src/harness/fixtures/demonslayer.json';
  const fixtures = JSON.parse(readFileSync(path, 'utf8')) as Fixture[];
  runHarness(fixtures, httpDeps(base)).then((rep) => {
    for (const e of rep.episodes) {
      const fails = e.checks.filter((c) => c.status === 'fail').map((c) => c.name).join(',');
      console.log(
        `${e.pass ? 'PASS' : 'FAIL'}  ${e.label}  [${fails || 'ok'}]  ${e.runtimeSeconds?.toFixed(0) ?? '-'}s ${e.topLang ?? '-'}`,
      );
    }
    console.log(`\n${rep.passed}/${rep.total} correct (${(rep.passRate * 100).toFixed(0)}%) against ${base}`);
    writeFileSync('harness-report.json', JSON.stringify(rep, null, 2));
  });
}

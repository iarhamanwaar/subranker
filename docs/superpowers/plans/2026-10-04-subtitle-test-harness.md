# Subtitle Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline, automatic, per-episode test harness that measures what fraction of episodes SubRanker returns a correct top subtitle for, and record a baseline for Demon Slayer.

**Architecture:** A pure oracle (`src/harness/oracle.ts`) judges a single episode's top subtitle from three signals — top result is the expected language, its runtime fits a single episode, and it has a sane cue count. A thin runner (`src/harness/run.ts`) replays real request fixtures against a running SubRanker instance (local or prod), downloads the top subtitle, and feeds the oracle. Fixtures are harvested from production logs and contain only request metadata (id, filename, hash, size) — never subtitle content.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest, tsx, pnpm. Reuses `parseTimeline` from `src/verify/cues.ts`.

**Spec:** `docs/superpowers/specs/2026-10-04-subtitle-correctness-and-test-harness-design.md` (this plan implements **Milestone 1** only; Milestones 2–4 get their own plans.)

## Global Constraints

- **Package manager: pnpm only.** Never invoke `npm` or `yarn`.
- **ESM import specifiers end in `.js`** even for `.ts` sources (repo convention, see any file in `src/`).
- **Tests live in `test/`**, not co-located, and import from `../src/**/*.js` (see `test/cues.test.ts`).
- **No copyrighted subtitle content in the repo.** Fixtures hold only `id`, `filename`, `videoHash`, `videoSize`, expected language, and runtime bounds.
- **Downloads in the harness go to `subs5.strem.io`/addon mirrors** (via the returned subtitle URLs), which are not quota-limited. The harness must never call the OpenSubtitles official API.
- Run tests with `pnpm test`; typecheck with `pnpm typecheck`.

## Review Focus

- **Empty subtitle list** (addon returns `{subtitles: []}`): the episode must be reported FAIL with a clear reason, never a crash or a thrown promise. (Task 4 runner test.)
- **Top subtitle download fails/times out**: runtime/cue checks see an empty timeline and FAIL gracefully; the run continues to the next fixture. (Task 4 runner test.)
- **Non-English sub ranked first while English exists lower** (the observed French-above-English bug): must FAIL the language check because the harness judges position 0, what Stremio auto-selects. (Task 2 test.)
- **Batch/multi-episode file** (runtime far over one episode, e.g. the 3704s Demon Slayer file): must FAIL the runtime check. (Task 1 test.)
- **Very short teaser/forced-only sub** (few cues): must FAIL the cue-sanity check. (Task 3 test.)

---

### Task 1: Harness types + runtime check

**Files:**
- Create: `src/harness/types.ts`
- Create: `src/harness/oracle.ts`
- Test: `test/harness-oracle.test.ts`

**Interfaces:**
- Consumes: `Timeline` (`number[]`, cue start times in seconds) from `../verify/cues.js`.
- Produces: `Fixture`, `Check`, `OracleResult` types; `runtimeCheck(timeline: number[], fx: Fixture): Check`.

- [ ] **Step 1: Write the failing test**

```ts
// test/harness-oracle.test.ts
import { describe, expect, it } from 'vitest';
import { runtimeCheck } from '../src/harness/oracle.js';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/harness-oracle.test.ts`
Expected: FAIL — cannot find module `../src/harness/oracle.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/harness/types.ts
export interface Fixture {
  label: string;               // "Demon Slayer S4E4"
  id: string;                  // "tt9335498:4:4"
  filename: string;            // the played release filename
  videoHash?: string;
  videoSize?: number;
  lang: string;                // expected language prefix, e.g. "en"
  expectedRuntimeMax: number;  // seconds; upper bound for one episode
  expectedRuntimeMin?: number; // seconds; default 300
}

export type CheckStatus = 'pass' | 'fail';
export interface Check { name: string; status: CheckStatus; detail: string; }
export interface OracleResult { pass: boolean; checks: Check[]; }
export interface EpisodeReport extends OracleResult {
  label: string; id: string; topLang?: string; topUrl?: string; runtimeSeconds?: number;
}
export interface HarnessReport {
  total: number; passed: number; passRate: number; episodes: EpisodeReport[];
}
```

```ts
// src/harness/oracle.ts
import type { Check, Fixture } from './types.js';

const DEFAULT_MIN = 300; // 5 min

export function runtimeCheck(timeline: number[], fx: Fixture): Check {
  const last = timeline.length ? timeline[timeline.length - 1]! : 0;
  const min = fx.expectedRuntimeMin ?? DEFAULT_MIN;
  const max = fx.expectedRuntimeMax;
  const ok = last >= min && last <= max;
  return {
    name: 'runtime',
    status: ok ? 'pass' : 'fail',
    detail: `last cue ${last.toFixed(0)}s, expected ${min}-${max}s`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/harness-oracle.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/harness/types.ts src/harness/oracle.ts test/harness-oracle.test.ts
git commit -m "feat(harness): episode runtime check + types"
```

---

### Task 2: Language check

**Files:**
- Modify: `src/harness/oracle.ts`
- Test: `test/harness-oracle.test.ts`

**Interfaces:**
- Produces: `languageCheck(topLang: string | undefined, fx: Fixture): Check`.

- [ ] **Step 1: Write the failing test** (append to `test/harness-oracle.test.ts`)

```ts
import { languageCheck } from '../src/harness/oracle.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/harness-oracle.test.ts`
Expected: FAIL — `languageCheck` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `src/harness/oracle.ts`)

```ts
// OpenSubtitles returns 3-letter codes (eng/fre/pob). Match on the 2- or
// 3-letter English prefix so "en", "eng" both pass and "fre" fails.
const EN_CODES = new Set(['en', 'eng']);

export function languageCheck(topLang: string | undefined, fx: Fixture): Check {
  const lang = (topLang ?? '').toLowerCase();
  const ok = fx.lang.toLowerCase() === 'en'
    ? EN_CODES.has(lang)
    : lang.startsWith(fx.lang.toLowerCase());
  return {
    name: 'language',
    status: ok ? 'pass' : 'fail',
    detail: `top lang ${topLang ?? '(none)'}, expected ${fx.lang}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/harness-oracle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/harness/oracle.ts test/harness-oracle.test.ts
git commit -m "feat(harness): top-result language check"
```

---

### Task 3: Cue-sanity check + combined `judge`

**Files:**
- Modify: `src/harness/oracle.ts`
- Test: `test/harness-oracle.test.ts`

**Interfaces:**
- Produces: `cueSanityCheck(timeline: number[], min?: number): Check`; `judge(fx: Fixture, topLang: string | undefined, timeline: number[]): OracleResult`.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { cueSanityCheck, judge } from '../src/harness/oracle.js';

describe('cueSanityCheck', () => {
  it('passes a full episode of cues', () => {
    expect(cueSanityCheck(new Array(300).fill(0).map((_, i) => i * 4)).status).toBe('pass');
  });
  it('fails a near-empty sub', () => {
    expect(cueSanityCheck([1, 2, 3]).status).toBe('fail');
  });
});

describe('judge', () => {
  const good = new Array(300).fill(0).map((_, i) => i * 4); // ends at 1196s
  it('passes a correct English episode', () => {
    expect(judge(fx, 'eng', good).pass).toBe(true);
  });
  it('fails when any single check fails', () => {
    expect(judge(fx, 'fre', good).pass).toBe(false);          // language
    expect(judge(fx, 'eng', [10, 3704]).pass).toBe(false);     // runtime + cues
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/harness-oracle.test.ts`
Expected: FAIL — `cueSanityCheck`/`judge` not exported.

- [ ] **Step 3: Write minimal implementation** (append)

```ts
import type { OracleResult } from './types.js';

const MIN_CUES = 50;

export function cueSanityCheck(timeline: number[], min = MIN_CUES): Check {
  const ok = timeline.length >= min;
  return {
    name: 'cue-count',
    status: ok ? 'pass' : 'fail',
    detail: `${timeline.length} cues, expected >= ${min}`,
  };
}

export function judge(fx: Fixture, topLang: string | undefined, timeline: number[]): OracleResult {
  const checks: Check[] = [
    languageCheck(topLang, fx),
    runtimeCheck(timeline, fx),
    cueSanityCheck(timeline),
  ];
  return { pass: checks.every((c) => c.status === 'pass'), checks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/harness-oracle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/harness/oracle.ts test/harness-oracle.test.ts
git commit -m "feat(harness): cue-sanity check and combined judge()"
```

---

### Task 4: Runner (fetch → download → judge → aggregate)

**Files:**
- Create: `src/harness/run.ts`
- Test: `test/harness-run.test.ts`

**Interfaces:**
- Consumes: `judge` from `./oracle.js`; `parseTimeline` from `../verify/cues.js`; `Fixture`, `HarnessReport` from `./types.js`.
- Produces: `subPath(fx: Fixture): string`; `runHarness(fixtures: Fixture[], deps?: { fetchSubs; fetchText }): Promise<HarnessReport>`. `fetchSubs(fx) => Promise<Array<{id;url;lang;label?}>>`, `fetchText(url) => Promise<string>`. Injectable deps let tests avoid the network.

- [ ] **Step 1: Write the failing test**

```ts
// test/harness-run.test.ts
import { describe, expect, it } from 'vitest';
import { runHarness, subPath } from '../src/harness/run.js';
import type { Fixture } from '../src/harness/types.js';

const fx: Fixture = {
  label: 'DS S4E4', id: 'tt9335498:4:4', filename: 'a b.mkv',
  videoHash: 'abc', videoSize: 123, lang: 'en', expectedRuntimeMax: 3000,
};
const srt = new Array(300).fill(0)
  .map((_, i) => `${i}\n00:${String(Math.floor(i / 15)).padStart(2, '0')}:${String((i * 4) % 60).padStart(2, '0')},000 --> 00:00:01,000\nx`)
  .join('\n\n');

describe('subPath', () => {
  it('encodes id and extras like Stremio', () => {
    expect(subPath(fx)).toBe('/subtitles/series/tt9335498%3A4%3A4/filename=a%20b.mkv&videoSize=123&videoHash=abc.json');
  });
});

describe('runHarness', () => {
  it('passes a correct English episode', async () => {
    const rep = await runHarness([fx], {
      fetchSubs: async () => [{ id: '1', url: 'u', lang: 'eng' }],
      fetchText: async () => srt,
    });
    expect(rep.passed).toBe(1);
    expect(rep.passRate).toBe(1);
  });
  it('fails gracefully on an empty subtitle list', async () => {
    const rep = await runHarness([fx], { fetchSubs: async () => [], fetchText: async () => '' });
    expect(rep.passed).toBe(0);
    expect(rep.episodes[0]!.checks.some((c) => c.status === 'fail')).toBe(true);
  });
  it('fails gracefully when the download throws', async () => {
    const rep = await runHarness([fx], {
      fetchSubs: async () => [{ id: '1', url: 'u', lang: 'eng' }],
      fetchText: async () => { throw new Error('timeout'); },
    });
    expect(rep.passed).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/harness-run.test.ts`
Expected: FAIL — module `../src/harness/run.js` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/harness/run.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { parseTimeline } from '../verify/cues.js';
import { judge } from './oracle.js';
import type { EpisodeReport, Fixture, HarnessReport } from './types.js';

interface Sub { id: string; url: string; lang: string; label?: string; }
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
      try { timeline = parseTimeline(await deps.fetchText(top.url)); } catch { timeline = []; }
    }
    const result = judge(fx, top?.lang, timeline);
    episodes.push({
      label: fx.label, id: fx.id, topLang: top?.lang, topUrl: top?.url,
      runtimeSeconds: timeline.at(-1), ...result,
    });
  }
  const passed = episodes.filter((e) => e.pass).length;
  return { total: episodes.length, passed, passRate: episodes.length ? passed / episodes.length : 0, episodes };
}

// CLI entry: `pnpm harness [fixtures.json]`, HARNESS_BASE overrides the target.
if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.env.HARNESS_BASE ?? 'http://127.0.0.1:7010';
  const path = process.argv[2] ?? 'src/harness/fixtures/demonslayer.json';
  const fixtures = JSON.parse(readFileSync(path, 'utf8')) as Fixture[];
  runHarness(fixtures, httpDeps(base)).then((rep) => {
    for (const e of rep.episodes) {
      const fails = e.checks.filter((c) => c.status === 'fail').map((c) => c.name).join(',');
      console.log(`${e.pass ? 'PASS' : 'FAIL'}  ${e.label}  [${fails || 'ok'}]  ${e.runtimeSeconds?.toFixed(0) ?? '-'}s ${e.topLang ?? '-'}`);
    }
    console.log(`\n${rep.passed}/${rep.total} correct (${(rep.passRate * 100).toFixed(0)}%) against ${base}`);
    writeFileSync('harness-report.json', JSON.stringify(rep, null, 2));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/harness-run.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the pnpm script**

In `package.json` `scripts`, add:
```json
"harness": "tsx src/harness/run.ts"
```

- [ ] **Step 6: Commit**

```bash
git add src/harness/run.ts test/harness-run.test.ts package.json
git commit -m "feat(harness): runner with injectable fetch deps + pnpm script"
```

---

### Task 5: Harvest Demon Slayer fixtures from production logs

**Files:**
- Create: `src/harness/fixtures/demonslayer.json`
- Create: `scripts/harvest-fixtures.sh`

**Interfaces:**
- Produces: a `Fixture[]` JSON file consumed by the runner.

- [ ] **Step 1: Write the harvest script**

```bash
# scripts/harvest-fixtures.sh
# Pulls distinct (id, filename, videoHash, videoSize) for a title from the
# SubRanker host's journald logs and prints Fixture[] JSON to stdout.
# Usage (run against the server via your SSM helper): harvest-fixtures.sh tt9335498 "Demon Slayer"
set -euo pipefail
IMDB="$1"; NAME="${2:-episode}"
sudo journalctl -u subranker --since "30 days ago" --no-pager \
  | grep -oE "\"path\":\"/subtitles/series/${IMDB}%3A[0-9]+%3A[0-9]+/filename=[^\"]+\.json\"" \
  | sort -u \
  | NAME="$NAME" node -e '
    const rl = require("readline").createInterface({ input: process.stdin });
    const out = []; const seen = new Set();
    rl.on("line", (l) => {
      const m = l.match(/series\/([^/]+)\/filename=([^&."]+)(?:&videoSize=(\d+))?(?:&videoHash=([0-9a-f]+))?/);
      if (!m) return;
      const id = decodeURIComponent(m[1]); if (seen.has(id)) return; seen.add(id);
      out.push({ label: `${process.env.NAME} ${id}`, id, filename: decodeURIComponent(m[2]),
        ...(m[3] ? { videoSize: Number(m[3]) } : {}), ...(m[4] ? { videoHash: m[4] } : {}),
        lang: "en", expectedRuntimeMax: 3000 });
    });
    rl.on("close", () => process.stdout.write(JSON.stringify(out, null, 2)));
  '
```

- [ ] **Step 2: Generate the fixtures file**

Run the script on the SubRanker host (via the session's SSM helper) and save its stdout to `src/harness/fixtures/demonslayer.json`. It must be a JSON array of `Fixture`. Two entries are already known-good from captured logs and must appear (expand with the harvested rest):

```json
[
  {
    "label": "Demon Slayer tt9335498:4:3",
    "id": "tt9335498:4:3",
    "filename": "Demon.Slayer.Kimetsu.no.Yaiba.S04E03.A.Sword.from.Over.300.Years.Ago.1080p.AMZN.WEB-DL.DDP2.0.H.264-KQRM.mkv",
    "videoSize": 962080926,
    "videoHash": "bb98d617a3a9ebe2",
    "lang": "en",
    "expectedRuntimeMax": 3000
  },
  {
    "label": "Demon Slayer tt9335498:4:4",
    "id": "tt9335498:4:4",
    "filename": "Demon.Slayer.Kimetsu.no.Yaiba.S04E04.Thank.You,.Tokito.1080p.AMZN.WEB-DL.DDP2.0.H.264-KQRM.mkv",
    "videoSize": 1146948426,
    "videoHash": "5dbc1797509fb79b",
    "lang": "en",
    "expectedRuntimeMax": 3000
  }
]
```

- [ ] **Step 3: Validate the fixtures parse as `Fixture[]`**

Run: `node -e "const f=require('./src/harness/fixtures/demonslayer.json'); if(!Array.isArray(f)||!f.every(x=>x.id&&x.filename&&x.lang)) throw new Error('bad fixtures'); console.log(f.length+' fixtures ok')"`
Expected: prints `<n> fixtures ok`.

- [ ] **Step 4: Commit**

```bash
git add scripts/harvest-fixtures.sh src/harness/fixtures/demonslayer.json
git commit -m "feat(harness): Demon Slayer fixtures harvested from prod logs"
```

---

### Task 6: Run the baseline and record it

**Files:**
- Create: `docs/superpowers/plans/harness-baseline-2026-10-04.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Run the harness against production**

Run: `HARNESS_BASE=https://subs.bugvi.org pnpm harness src/harness/fixtures/demonslayer.json`
Expected: a PASS/FAIL line per episode and a final `X/Y correct (Z%)`. `harness-report.json` is written.

- [ ] **Step 2: Record the baseline**

Write `docs/superpowers/plans/harness-baseline-2026-10-04.md` containing: the date, the command, the headline `Z%`, and the per-episode table (label, pass/fail, failing checks, runtime, top lang) copied from `harness-report.json`. This is the number Milestones 2–4 must beat.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/harness-baseline-2026-10-04.md
git commit -m "docs(harness): record Demon Slayer correctness baseline"
```

- [ ] **Step 4: Confirm the harness catches the known failures**

Verify in the baseline report that `tt9335498:4:4` (and similar) shows FAIL with `language` and/or `runtime` among the failing checks — the 61-minute wrong-content file and/or French-first result we found manually. If every episode unexpectedly passes, the harness is not reproducing the known bug: stop and investigate before declaring a baseline.

---

## Notes for later milestones (not part of this plan)

- Release-group matching is deferred: the Stremio subtitle response exposes only `id/url/lang/label`, so the harness can't see the sub's release name yet. Milestone 2+ enriches the response (or the harness runs the pipeline in-process) to enable a group-exact check.
- Expected runtime is a fixed band (`expectedRuntimeMin`..`expectedRuntimeMax`) in v1. A later milestone can tighten it with per-episode runtime from Cinemeta/Kitsu.

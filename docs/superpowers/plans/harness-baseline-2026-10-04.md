# Harness Baseline — Demon Slayer (Milestone 1)

**Date:** 2026-10-04
**Command:** `HARNESS_BASE=https://subs.bugvi.org pnpm harness src/harness/fixtures/demonslayer.json`
**Result:** **0/15 correct (0%)**

Every episode auto-selects a non-English top subtitle — the language signal is
absent from ranking (spec root cause #3). This is the number Milestones 2–4 must beat.

| Episode | Verdict | Failing checks | Top runtime | Top lang |
|---------|---------|----------------|-------------|----------|
| tt9335498:3:1 | FAIL | language | 2790s | vie |
| tt9335498:3:10 | FAIL | language | 1418s | bul |
| tt9335498:3:11 | FAIL | language | 1943s | ita |
| tt9335498:3:2 | FAIL | language | 1419s | ita |
| tt9335498:3:3 | FAIL | language | 1435s | dan |
| tt9335498:3:4 | FAIL | language | 1435s | dan |
| tt9335498:3:5 | FAIL | language | 1435s | dan |
| tt9335498:3:6 | FAIL | language | 1422s | dan |
| tt9335498:3:7 | FAIL | language | 1435s | dan |
| tt9335498:3:8 | FAIL | language | 2810s | bul |
| tt9335498:3:9 | FAIL | language | 1418s | zht |
| tt9335498:4:1 | FAIL | language | 2964s | fre |
| tt9335498:4:2 | FAIL | language | 1434s | fre |
| tt9335498:4:3 | FAIL | language | 1434s | pob |
| tt9335498:4:4 | FAIL | language | 1435s | fre |

Notes:
- The known French-first S4E4 (`tt9335498:4:4`) is FAIL(language), top lang `fre` — the harness reproduces the reported bug.
- Runtimes are mostly ~24–48min, so the runtime check passes for most; **language is the universal failure** at baseline.

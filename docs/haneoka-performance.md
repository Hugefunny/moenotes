# Full-card-pool validation - 2026-10-26

The baseline `8bb4f9e94959b1f9c618e07d0a6c382af19e6df6` returns candidates for all measured scenes.
Free score, power, CP and PT complete their top-three proof within the two-second budget.
Items, combined rewards and Gekisou need further work on proof time; several combined requests also find lower
rewards than the original model within the measured budget. Production switching remains pending.

## Inputs and execution

- Haneoka base: `c91e6459a5ed43d55dc2b75e6a9d4f55b3edc62a`.
- Baseline downstream patch: `53226cdad99bf881a5a1d2243f0625287c4a54913352c361e8efc3acdd586d5d`.
- Baseline WASM: `8e3415ab6e3f425a23983b57b8cb3053a7cb846034a053ee9e287548bd5436f1`.
- Published reference model: `564b8911208cb1c5e91170a87f0c2deba7efd7a0`, version 0.0.12.
- JP: all 70 members / 72 Snaps, dataset `ff24ee4782ba9d983ed805ed9ef4769b15380c2d876a4b8cc92a78f0348b3719`.
- Intl: all 71 members / 74 Snaps, dataset `1f04169cb6ceae88f04015862a53440a295b04a3e66f68aaf4942cacc5c5fd57`.
- Declared account: every snapshot card owned, maximum legal card level/awake/rank/skill level from its source
  progression tables; character rank 1, VIP 1, no band items or active memories. The adapter accepted every card.
  This tests complete snapshot card pools under declared growth, not a real saved account or every possible growth.
- AMD Ryzen 7 5800H, 16 logical threads, Windows 10.0.26200, Bun 1.4.4. Searches are sequential in one process.
- Two runs per scene/server, fresh solver per scene, second run on that same solver. `k=3`, no fixed/excluded
  cards, all Snaps enabled. Twelve scenes across both servers give 48 measured runs. Played charts use music
  100001 (Easy/Expert as named); challenge uses the first event's first challenge chart; Mission selects the first
  source song with a LUCK mission. Rewards project an active clock inside event 1, with ordinary consumption 1
  and challenge consumption 200. No candidate pool reduction was used.

## Baseline, two-second search budget

Wall time includes adapter validation, chart preparation, native search and serialization. Solver construction
is separate (42-90 ms); WASM instantiation was approximately 24 ms. Every run returned status `ok`, three teams
and complete-owned-card coverage. A proof applies only to that request and the pinned data/model.

| Scene | Wall time range, ms | Proven / runs |
| --- | ---: | ---: |
| Power | 48-85 | 4 / 4 |
| Free score / Easy | 61-80 | 4 / 4 |
| Free score / Expert | 62-74 | 4 / 4 |
| Free maximum score | 78-86 | 4 / 4 |
| Battle score | 2068-2198 | 0 / 4 |
| Mission score / LUCK | 2014-2696 | 0 / 4 |
| Free PT | 464-554 | 4 / 4 |
| Free event items | 2009-2012 | 0 / 4 |
| Free CP | 116-144 | 4 / 4 |
| Free PT + 20 CP, then items | 2003-2008 | 0 / 4 |
| Challenge PT, then items | 2003-2005 | 0 / 4 |
| Skip PT + 20 CP, then items | 2002-2003 | 0 / 4 |

First candidate notifications arrived after 47-1902 ms. Some cold Gekisou calls exceeded the nominal deadline;
the largest observed wall time was 2696 ms for a 2000 ms request. Initialization and interruption granularity
need separate improvement. Post-call resident process memory ranged from 191 to 859 MiB across the sequential
suite; these are neither per-request allocation nor peak-memory measurements. Phone memory and latency remain
unmeasured.

## Longer requests and actual Worker entry

Intl items, Free combined, Challenge combined and Skip combined were each run twice at 10 seconds. All returned
three teams but remained unproven, with the same primary best values seen at 2 seconds. At the baseline patch,
the original published model completed Challenge combined at 23750 in 466 ms and Skip combined at 993 in 73 ms;
the adapter found 20550 and 547 respectively after 10 seconds. The adapter's Free combined value was 2000 at
2 seconds, versus the reference's best found 1582 at 2 seconds; both were unproven. These are measured candidate
quality comparisons, not a blanket claim that either engine is faster or better.

The actual `deck-worker-core.mjs` loaded the rebuilt bundle through its verified byte/hash initialization.
On the Intl full pool, Worker Free Expert took 139 ms, published its first candidate at 121 ms and completed proof;
Worker Free combined took 2005 ms, first candidate at 147 ms, and retained three teams without proof. Worker
initialization took 167 ms. This exercises the Worker protocol core in Bun; browser scheduling, structured-clone
cost and mobile devices are not included.

Native counters locate a traversal problem: in one two-second Skip combined call, 376380 exact formations were
evaluated while only five member nodes were visited; its candidate stayed at 547 against upper bound 993.
The Free combined call similarly evaluated 29564 formations over five member nodes. Search spends its budget
assigning Snaps to an early roster. The next patch adds bonus-based traversal hints and selects the first variable
reward level's bonus for bounds. Exact vectors, candidate scope, physical-formation retention and proof gates
remain intact; the small-pool exhaustive tests must continue to pass.

## Local evidence

Ignored `.haneoka/` retains `full-pool.ts`, `full-pool-entries.ts`, the complete declared accounts and hashed requests,
`full-pool-baseline.jsonl`, `full-pool-long.jsonl`, and `full-pool-entries-baseline.json`. These store full answers, progress,
input identities, wall times and counters. The results above are frozen baseline observations; subsequent model
patches are recorded separately below. The production provider has not changed.

## Follow-up patch and remaining-scene migration

Patch `02ece9bd681b0f9c3b177a47b5bb2c25800cd81822822c78c15abd3ae40ff8de` and WASM `9c81208a46fdf20cce95fdf590c7d9f9b6aed277ac9efbf44dadde85a02b4786` were rebuilt together and checked by 122 bridge tests
(5136 assertions). The original 896 tests passed, with the existing Windows GNU-time test skipped; type checking,
lint and search/SEO checks passed. The final suite repeats the original full-pool matrix and adds Skip score,
Challenge Skip score and event-parameter power: 60 runs in total, all `ok` with three teams. Inputs remain the
same declared full-card pools. New goals were independently compared with the original model across both
servers and four Skip difficulties, including event gating and a 30-formation Skip oracle.

| Scene | Follow-up wall range, ms | Proven / runs |
| --- | ---: | ---: |
| Power | 58-81 | 4 / 4 |
| Free score / Easy | 61-101 | 4 / 4 |
| Free score / Expert | 72-78 | 4 / 4 |
| Free maximum score | 77-108 | 4 / 4 |
| Battle score | 2020-2078 | 0 / 4 |
| Mission score / LUCK | 2016-3240 | 0 / 4 |
| Free PT | 478-614 | 4 / 4 |
| Free event items | 2009-2012 | 0 / 4 |
| Free CP | 120-148 | 4 / 4 |
| Free combined | 2004-2006 | 0 / 4 |
| Challenge combined | 2003-2005 | 0 / 4 |
| Skip combined | 2002-2003 | 0 / 4 |
| Skip score | 58-75 | 4 / 4 |
| Challenge Skip score | 61-94 | 4 / 4 |
| Power with event parameters | 61-86 | 4 / 4 |

At the same two-second budget, every tested server/repeat improved Challenge combined from 20550 to 23750,
and Skip combined from 547 to 993. Both primary payoffs now match the original model's measured best values
for these fixtures. Their lexicographic proof is still incomplete. Free combined stayed at 2000; items and
Gekisou remain unproven. No general latency speedup is claimed for unchanged scenes.

Cold Mission latency reached 3240 ms under a 2000 ms request in the follow-up suite. The deadline is therefore
a search budget, not a hard end-to-end limit. A separate cold native-counter probe of Challenge combined
also exhausted its two-second preparation/search budget before retaining any team, despite the 60 adapter-suite
runs all returning three teams. Preparation/interruption granularity and the large resident-memory
observations remain outstanding acceptance issues. No phone or complete browser account-import measurement
was added here. Production switching is still pending.

The final input/answer/progress receipts are `full-pool-after.jsonl`; original Worker/reference receipts are frozen
in `full-pool-entries-baseline.json`. Final Worker/counter receipts are `full-pool-entries.json`, with its own
patch/WASM identity. These ignored local files accompany the public findings; new local verification tests
are not part of the commit.

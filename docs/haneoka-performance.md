# Full-card-pool validation - 2026-10-26

The latest follow-up completes Free combined proofs within two seconds, shortens item proof and tightens Battle deadlines.
See [the latest results](#free-proofs-and-battle-deadlines---2026-10-26) for current measurements and remaining gaps.

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

## Proof bounds and cold-start follow-up - 2026-10-26

This revision compares against `a64402ac62e1fcef0e8f75dbe9ed8eaaa4ddbbeb` above. The final isolated run uses
the same 60 requests, dataset hashes, complete card pools, account hashes and two-second budgets. No tests,
type checks or native builds ran alongside that final measurement. All 60 requests return three teams and
retain or improve the previous best objective value. This remains a declared full-ownership desktop fixture;
it does not establish all-song, actual-account, phone or isolated peak-memory acceptance.

- Downstream patch: `b14d1682e5f9904bcf780bf2548b740b2b53b52c9342a24289cc44a5664a674d`.
- WASM: `9557fe7d2eb3b24496911ed04929d6a67f63b51bff960e57977aba5cce72e502`.
- Bundle: `fe2fbb621b634c1eed46f0360e264e9c30af758a57bad7f93984d07eabecc3bf`.
- Raw receipts: ignored/local `full-pool-proof-isolated.jsonl`, `full-pool-entries-proof.json` and
  `proof-entries-isolated.log`; earlier and intermediate measurements remain separate.

| Scene | Previous wall time, ms | Current wall time, ms | First candidate, ms | Current proven / runs |
| --- | ---: | ---: | ---: | ---: |
| free-combined | 2003-2006 | 2003-2005 | 86-107 | 0 / 4 |
| challenge-combined | 2002-2006 | 76-80 | 71-74 | 4 / 4 |
| skip-combined | 2001-2004 | 59-77 | 56-73 | 4 / 4 |
| battle | 2019-2078 | 2051-2265 | 265-320 | 0 / 4 |
| mission | 2015-3240 | 2007-2067 | 185-209 | 0 / 4 |

Challenge combined retains 23750 and Skip combined retains 993, now with complete top-three proofs in both
servers and both repeats. Free combined retains 2000, including a second seeded physical formation at that
primary value, but its top-three proof remains incomplete. Items and Gekisou also remain unproven.

Exact weighted reward vectors now bound every priority level against the Kth retained physical formation.
Character suffix bounds and remaining-Snapshot matching tighten both reward bonuses. Equal upper vectors
can be pruned only after K legal formations exist; no physical pool reduction or scalar flattening is used.

The unrestricted combined score-cap pass previously consumed preparation time before any candidate could be
retained. It is skipped. Free combined instead uses a native score proposal with a 100 ms budget and legal leader
rotations, preserving every member/Snapshot binding, before the unchanged full reward search evaluates seeds.
The raw native `run` counter probe deliberately omits these adapter seeds: its Free combined best is 1331;
the adapter and actual Worker retain 2000. These are different entry paths, not interchangeable quality evidence.

Gekisou replays one legal power proposal through native `evaluateAll` before full preparation. This supplies
an actual goal score without replacing the full-search cache. Its proof never certifies the full pool. The
complete search keeps its original pool and receives the proposal as a seed. Preparation checks between
member/Snapshot jobs and WASM support contexts; expired leader traversal stops with an unknown upper bound.
Battle and Mission retain the previous best scores, 36087609.8 and 35959251.398098335 respectively, in all four
measurements each. The earlier constrained-search bootstrap degraded those candidates by replacing the cache;
fixed replay and a single proposal remove that regression.

The budget is cooperative. A native operation or final result completion may overrun the deadline. A zero
budget can validly return no candidates. The measured two-second requests all return candidates, including
the previously empty cold Challenge combined case; this does not guarantee candidates at every shorter budget.

### Actual bundled Worker and native counters

- Worker `mission`: 2091 ms, first progress 260 ms, 3 teams, proven `false`.
- Worker `battle`: 2108 ms, first progress 288 ms, 3 teams, proven `false`.
- Worker `free-expert`: 112 ms, first progress 100 ms, 3 teams, proven `true`.
- Worker `free-combined`: 2005 ms, first progress 96 ms, 3 teams, proven `false`.
- Worker `challenge-combined`: 81 ms, first progress 73 ms, 3 teams, proven `true`.
- Worker `skip-combined`: 58 ms, first progress 54 ms, 3 teams, proven `true`.

The native Challenge combined probe performs 5 exact evaluations and Skip combined 13, each with 15 member
nodes. The previous Skip probe spent hundreds of thousands of exact evaluations under the first few member
nodes. Native counter timing excludes adapter and Worker initialization; the table above includes adapter
validation and native work. Worker initialization is recorded separately in the raw log.

### Remaining migration and acceptance

Skip grade parsing now covers case-sensitive names, signed Int32 numeric tokens and comma-separated named
enum OR combinations. Both servers' ordinary/challenge Skip combined settlements and single PT/items/CP
settlements match the published model. Unicode whitespace, numeric overflow and unknown/missing grades are
covered; missing settlement rows remain diagnostic.

Free combined/item proof time, tighter Gekisou interruption latency, isolated peak memory, other event scenes,
maximum rewards, Arena (the frozen tables are empty), active memories, cross-song UI and stopped-search
continuation remain open. Production provider selection is unchanged; no browser/phone acceptance is added
by these Worker-core and WASM measurements.


## Free proofs and Battle deadlines - 2026-10-26

Account validation now decodes each Master table once per request. A ten-call comparison on both servers and
two growth profiles preserves every adapter field; mean validation drops from 62-76 ms to 2-5 ms. The cache
ends with the request, so later requests re-read their input tables.

This follow-up uses the same frozen full-pool accounts and requests as downstream commit
`9107698479d8285dd08e9e5af0350f18203a8445`. All 60 request, dataset and account identities match that baseline;
all return three legal teams and no primary objective value regresses. The 20 additional maximum Skip runs use
the same complete pools and declared growth. Performance runs were sequential with no concurrent build or test.

- Native patch: `6ecb8e522b50fc0f0d716c7bf1c17498bd0e595b237e2a0749e337f92187c4b3`.
- WASM: `610800af56fda00da8f7926474f09eefb1c5a247b0eda6f0df8eb4823c0f5431` (6911616 bytes).
- Adapter: `8a90405cf92db9c8b5feab18cb4e88479a14ede30d585ffd87f822cd64d7abd5`.

### Complete-pool two-second requests

| Scene | Wall time, ms | Proven / runs | Best primary value |
| --- | ---: | ---: | ---: |
| free-combined | 1670-1877 | 4 / 4 | 2500 |
| free-items | 2004-2008 | 0 / 4 | 2184 |
| battle | 2002-2003 | 0 / 4 | 36087609.8 |
| mission | 2006-2034 | 0 / 4 | 35959251.398098335 |
| free-pt | 143-204 | 4 / 4 | 1541 |
| free-cp | 55-78 | 4 / 4 | 50 |
| challenge-combined | 32-43 | 4 / 4 | 23750 |
| skip-combined | 10-15 | 4 / 4 | 993 |

Free combined is PT + 20 CP, then items, with three physical formations. Its best primary payoff rises from
2000 to 2500. Native search proves the first-level top K before fixing an exact prefix; the remaining levels
are searched over the original pool. A failed or incomplete prefix stage supplies seeds only. Coupled power/skill
and per-order profile bounds tighten the complete grade vectors without scalarizing priorities.

Single PT/items now use the published model's payoff-then-power ordering, instead of the donor's implicit
other-reward and mean-score refinements. Power refinement uses a power upper bound: the generic score-product
relaxation is disabled because dividing its product bound by a skill upper bound can underestimate power.
An independent frozen WASM enumerated 600 leader/Snapshot formations per server. Both constrained searches
match its exact best payoff 2184 and power 1,388,380; the unrestricted pool retains that witness.

### Item proof with a longer budget

The preserved baseline bundle and final bundle run alternately on the same frozen inputs, with a 10-second
budget. Both keep the same primary payoff 2184. Payoff ties now select power, so secondary score values and
lower-ranked formations may differ from the old PT/score order.

| Server | Baseline wall, ms | Baseline proven | Final wall, ms | Final proven |
| --- | ---: | --- | ---: | --- |
| intl | 10004 | false | 4790 | true |
| jp | 9436 | true | 4509 | true |

Item top-three proof still exceeds two seconds. A short request preserves its three candidates with incomplete
proof. The timings above certify the recorded full-pool requests, not all songs, growth states or devices.

### Frame interruption and actual Worker

WASM Gekisou replay checks the absolute deadline during frames, maximum-order completion and MISS replay.
Interruption retains completed candidates and reports incomplete proof with unknown bound/counters. The same
context can run again. The MISS replay objective also forwards Snapshot power preparation to its bound, fixing
a baseline out-of-bounds failure. Fixed-formation replay stays identical for all 120 orders under the tested
expected/maximum and Great/Just/MISS inputs.

Non-LUCK Battle enters native search directly; LUCK keeps a scored power fallback. The measured Battle budget
overrun is now a few milliseconds, with its prior best score retained. First progress is later than the sixth
milestone's bootstrap path. Mission/LUCK can still overrun during bootstrap/finalization. The budget remains cooperative.

| Bundled Worker request | Wall, ms | First progress, ms | Proven |
| --- | ---: | ---: | --- |
| mission | 2019 | 158 | false |
| battle | 2003 | 628 | false |
| free-expert | 31 | 19 | true |
| free-items | 2005 | 44 | false |
| free-combined | 1736 | 639 | true |
| challenge-combined | 34 | 16 | true |
| skip-combined | 12 | 8 | true |

These Worker-core calls load the final JS/WASM bytes with the existing integrity checks. Native counter probes
are separate calls without adapter score seeds; a raw Free combined probe can retain 2500 while its proof is
still incomplete at two seconds. It is not the adapter/Worker proof receipt.

### Remaining-scene migration

Ordinary Skip maximum PT/items/CP and Challenge Skip maximum PT/items now use the deterministic one-settlement
contract. All 20 complete-pool runs return three teams and proven results, with exact denominator 1 and no
skill-order statistics. Their measured wall-time range is 12-239 ms.
The page still normalizes Skip to expected; this adds request/Worker capability. Played maximum rewards and
combined maximum remain unsupported. Skip payoff ties compare power, including constant CP.

### Verification and acceptance

- Final adapter/native/Worker validation: 259 passed, 0 failed, 6226 assertions.
- Includes frozen 1200-formation power oracles, earlier exact-vector/overflow and physical-formation oracles,
  source-model reward comparisons, deadline recovery and actual bundled Worker paths.
- Existing repository suite: 896 passed, one existing Windows/GNU-time skip. Type-check: 668 files, zero errors
  and warnings, nine existing hints. Lint and search/SEO checks pass (44 routes, 22308 URLs).
- New tests, inputs, generated runtimes and raw receipts remain ignored local verification artifacts.

Further work includes item proof within short budgets, Mission/LUCK interruption latency, other played reward
scenes/maximum rewards, Arena and active-memory source coverage, cross-song UI and stopped-search continuation.
Peak memory, real-account import and browser/phone acceptance remain separate. Production still uses the original provider.


## Reward bounds, LUCK recovery and Skip combined maximum - 2026-10-26

This comparison checks correct results and material latency changes against the preserved runtime from
`9995829ac47a7192cef0064a356aa26d0b3cf6c8`. A configured two-second budget is cooperative, rather than a hard
wall-clock acceptance threshold. The same frozen JP/Intl complete card pools and declared legal maximum growth
are used; these are specified scene requests, not an all-song or real-account browser run.

- Patch: `2fc6950de0f6f4e1687ce661cc493750cb78c8ddbc9af73b4c8fbd270d5b783a`.
- WASM: `a55704e95104dc4172c6ecebbee302a03f52351531d26e45cc904126cb074ebf` (6901698 bytes).
- Adapter: `bc04da625268e103a4cb314a8d03552b871893cd9e061f1b889b27b3bb4e977d`.

### Alternating old/new requests

The 120 isolated calls cover 15 scenes, two servers, two repeats and both runtimes. Each repeat reverses the
execution order. Dataset hashes, account hashes and requests match within every pair. All 60 current calls
return three legal candidates, no error, and the same best primary value as the baseline. No build, type-check
or test ran concurrently with these measurements.

| Scene | Baseline wall, ms | Current wall, ms | Baseline / current proven |
| --- | ---: | ---: | ---: |
| power | 5-18 | 6-21 | 4/4 → 4/4 |
| free-easy | 14-35 | 14-36 | 4/4 → 4/4 |
| free-expert | 16-27 | 16-23 | 4/4 → 4/4 |
| free-maximum | 24-43 | 26-43 | 4/4 → 4/4 |
| battle | 2002-2006 | 2002-2003 | 0/4 → 0/4 |
| mission | 2010-2058 | 1964-2047 | 0/4 → 0/4 |
| free-pt | 141-207 | 74-136 | 4/4 → 4/4 |
| free-items | 2005-2007 | 1409-1520 | 0/4 → 4/4 |
| free-cp | 55-102 | 56-128 | 4/4 → 4/4 |
| free-combined | 1761-2014 | 1770-2010 | 3/4 → 2/4 |
| challenge-combined | 33-36 | 31-35 | 4/4 → 4/4 |
| skip-combined | 10-12 | 10-14 | 4/4 → 4/4 |
| skip-score | 9-10 | 8-10 | 4/4 → 4/4 |
| challenge-skip-score | 10-13 | 10-11 | 4/4 → 4/4 |
| power-event | 13-16 | 13-20 | 4/4 → 4/4 |

Item proof now completes in the configured budget, with payoff 2184 and powers 1388380, 1204384 and 1203672.
Single PT/item search compares payoff and power directly. Its coupled order bounds reuse conservative prefixes,
and small ordered matching avoids rebuilding full remaining-Snapshot matrices. The full candidate pool remains.

Free combined is close to the short deadline: the paired calls finish with proof in 3/4 baseline versus 2/4
current calls, while every best payoff remains 2500. A fresh-process control alternates baseline/current/current/
baseline with a ten-second budget. All 16 controls complete the same proof: baseline 1744-2042 ms,
current 1732-2151 ms; pooled medians 1990 and 1980 ms.
This control shows no material complete-proof slowdown; short-budget proof status still varies near the cutoff.

Mission retains its previous best score 35959251.398098335 and incomplete proof. LUCK distributions now check
deadlines inside frames; fixed-team bootstrap and MISS replay share that deadline. Context errors propagate,
and an interrupted evaluation does not become a completed cached result. Infallible bound jobs finish at a job
boundary, with up to 40 ms reserved for boundaries and finalization. Occasional wall-time overrun remains
visible in the table; it is not reported as a hard cutoff guarantee.

### Actual bundled Worker

The Worker core loads the current descriptor, JS and WASM with its existing hash and size checks.

| Request | Wall, ms | First progress, ms | Proven |
| --- | ---: | ---: | --- |
| mission | 2019 | 221 | false |
| battle | 2003 | 733 | false |
| free-expert | 31 | 19 | true |
| free-items | 1602 | 46 | true |
| free-combined | 2002 | 790 | false |
| challenge-combined | 38 | 17 | true |
| skip-combined | 14 | 9 | true |

### Remaining-scene increment and validation

Ordinary and Challenge Skip combined maximum now use the same deterministic settlement as expected aggregation.
The adapter advertises the capability, and the answer parser accepts maximum combined results only for Skip.
Eight complete-pool expected/maximum comparisons, four published-model fixed-formation comparisons and one
actual Worker case pass. Every level retains denominator 1. Challenge CP earnings remain rejected; the page
still normalizes Skip to expected. Played maximum rewards remain outside this increment.

- 282 distinct adapter/native/Worker cases pass in batches. A full run initially had one failure from requiring
  a recovery request to return a candidate within 250 ms. The recovery check now proves a fixed formation
  without a timing assumption and compares it with independent frozen replay; all eight LUCK checks pass.
  Real short-budget performance is covered by the separate complete-pool comparison above.
- Frozen 1200-formation power witnesses and mixed-grade fractional reward oracles remain covered. Ordered power
  and bonus bounds also pass 10500 generated matching cases against independent Hungarian matching, including
  4568 feasible constrained power cases.
- Existing repository regression: 896 passed and one existing Windows/GNU-time skip. Initial Go subprocess
  failures were missing process PATH configuration; the same tests pass with the existing local Go toolchain.
- No UI/CSS/i18n changes or production provider switch. Browser/phone, peak memory, broader account/song cases,
  played maximum rewards, other event scenes, Arena/active memories, cross-song UI and continuation remain separate.

Local receipts: `eighth-final-paired.json`, `eighth-combined-control.jsonl`, `eighth-final-entries.json`,
`eighth-final-validation.json`, `eighth-recovery-final.log` and `eighth-ordered-proof.log`. New tests, data,
generators and runtimes remain ignored local verification artifacts.


## Ninth milestone: played maximum PT and event items, 2026-10-26

Acceptance follows the user's relaxed target: correct native rewards and no significant performance regression.
This increment adds Free / Challenge single PT and event-item maximum. It keeps the original provider and all
existing expected-reward paths. No card-pool reduction or hard two-second proof requirement is introduced.

Patch `60260764a11f928f303b679e1af3d2b8b8c68c4da75f538785da81a1b180c5ee`; WASM `ed4aec4b262ee46aaa078e70a69b16a7bd95a77256d42705061999bf020da32b` (6921825 bytes);
JS `ecafdb20c2d07bf449414fea89cc49d382223e6963076ad8c494260cd2f34025`. The normal release build and runtime hashes are recorded in ignored local receipts.

The same frozen JP/Intl complete card pools and declared maximum legal growth from the preceding milestone are used.
Each pair binds identical dataset/account/request hashes. Search budget is 2000 ms; setup is outside call timing.
Runs alternate version order, with two repeats per server and scene. Benchmark calls run without compilation or tests.
The four new modes compare against the published Moenotes model; existing modes compare against frozen `4cf26c7`.

| Scene | Baseline wall, ms | Current wall, ms | Baseline proven / runs | Current proven / runs |
| --- | ---: | ---: | ---: | ---: |
| free-pt-maximum | 2002-2004 | 58-144 | 0 / 4 | 4 / 4 |
| free-items-maximum | 2002-2002 | 2002-2002 | 0 / 4 | 0 / 4 |
| challenge-pt-maximum | 2002-2002 | 34-194 | 0 / 4 | 4 / 4 |
| challenge-items-maximum | 2001-2002 | 52-198 | 0 / 4 | 4 / 4 |
| free-pt | 75-151 | 77-99 | 4 / 4 | 4 / 4 |
| free-items | 1403-1547 | 1471-1552 | 4 / 4 | 4 / 4 |
| challenge-pt | 26-170 | 25-166 | 4 / 4 | 4 / 4 |
| challenge-items | 52-196 | 55-207 | 4 / 4 | 4 / 4 |
| free-cp | 63-82 | 57-76 | 4 / 4 | 4 / 4 |
| free-combined | 1767-1856 | 1708-1897 | 4 / 4 | 4 / 4 |
| challenge-combined | 31-42 | 32-39 | 4 / 4 | 4 / 4 |
| skip-combined | 10-11 | 10-16 | 4 / 4 | 4 / 4 |
| free-maximum | 22-29 | 25-30 | 4 / 4 | 4 / 4 |
| battle | 2002-2003 | 2002-2002 | 0 / 4 | 0 / 4 |
| mission | 1963-1989 | 1964-1999 | 0 / 4 | 0 / 4 |

Primary best values match in 48 of 60 pairs; 12 improve and 0 worsen. Full answers, progress, input identities and timing are
retained in `.haneoka/ninth-paired.json`; the summary is `.haneoka/ninth-performance-summary.json`.
These receipts describe the declared frozen pools and local desktop runtime, rather than real accounts or phone timing.

| New maximum scene | Server | Published best at 2 seconds | Haneoka best at 2 seconds |
| --- | --- | ---: | ---: |
| free-pt-maximum | intl | 1406 | 1590 |
| free-pt-maximum | jp | 1406 | 1590 |
| free-items-maximum | intl | 1831 | 2292 |
| free-items-maximum | jp | 1831 | 2292 |
| challenge-pt-maximum | intl | 19650 | 23750 |
| challenge-pt-maximum | jp | 18750 | 23750 |
| challenge-items-maximum | intl | 23512 | 23512 |
| challenge-items-maximum | jp | 30400 | 30400 |

Independent validation uses the published original for fixed-roster payoff/power/first-order semantics, and a frozen
earlier Haneoka WASM to exhaust 62 physical assignments and all 120 skill orders per declared mixed-grade case.
Per-grade settlements are supplied by separate frozen replays. Cases include decreasing reward grades and signed
Int32 overflow, partial play, consumption costs, inactive windows, zero budgets, progress certificates and page-produced requests.
The fixed-roster source comparison exposes existing native score differences: Free +613 points (about 0.0103%) and
Challenge -276 (about 0.0052%), with identical reward, power and selected order. This increment preserves Haneoka
scoring; it does not claim bitwise score parity with the published engine. The frozen native oracle verifies the new maximum.
All 44 comparisons of existing scenes retain the same primary best value and proof outcome. No significant
latency regression appears in this sample. All current calls return status `ok` and three teams. Free single-item
maximum remains unproven after two seconds, retaining payoff 2292 against the published model's 1831; this is a
best-found result, and the relaxed acceptance target does not require further proof tuning in this increment.

The actual bundled Worker core loads hash-verified data/JS/WASM and returns three teams for all eight new-mode
calls across both servers. Free maximum PT takes 123-140 ms; Challenge maximum PT 169-191 ms; Challenge maximum
items 53-68 ms. These six calls finish proof. Both Free maximum-item calls retain payoff 2292 at about 2003 ms,
with incomplete proof and progress candidates. Exact score/payoff denominators remain 1. This exercises the
real protocol core in Bun; browser scheduling and phone/peak-memory acceptance are not measured here.

- 315 distinct migration cases pass: the full run has 314 passes and one old assertion that played PT maximum
  is unsupported. That local assertion now checks the advertised new criterion and rejects still-unsupported
  Free CP maximum; its focused rerun passes. All other cases passed on the same final production-config WASM.
- Existing repository tests: 896 pass, one existing Windows/GNU-time skip. Astro check: 668 files, zero errors,
  zero warnings and nine existing hints. Lint and search/SEO checks pass (44 search routes, 22308 sitemap URLs).
- Local evidence includes `ninth-maximum.json`, `ninth-migration-tests.log`, `ninth-contract-recheck.log`,
  `ninth-paired.json`, `ninth-performance-summary.json`, `ninth-entries.json` and `ninth-final-validation.json`.
  New tests, source generators, data and runtime snapshots stay ignored and are excluded from delivery.
- The production provider is unchanged. Played combined maximum, Free CP maximum, Battle/Mission event rewards,
  Arena/active memories and cross-song UI/continuation remain outside this increment.

# Haneoka engine integration

The Haneoka engine is pinned at `c91e6459a5ed43d55dc2b75e6a9d4f55b3edc62a`.
The existing Moenotes card pool, account envelopes, Worker lifecycle and result components are reused.
The Rust engine, with the Moenotes reward patch, owns scoring and search; the adapter translates documents, goals and results.

## Local runtime

Install Bun, Git and Rust with the `wasm32-unknown-unknown` target, then run:

```sh
bun install --frozen-lockfile
rustup target add wasm32-unknown-unknown
bun run build:haneoka-engine
PUBLIC_DECK_RECOMMEND_ENGINE=/haneoka-team-engine/runtime.json bun run dev
```

In PowerShell, set `$env:PUBLIC_DECK_RECOMMEND_ENGINE='/haneoka-team-engine/runtime.json'` before `bun run dev`.

The build keeps the pinned external checkout unchanged under ignored `.haneoka/engine`.
`patches/haneoka-rewards.patch` is applied to an independent generated source directory, whose file hashes
are checked before reuse. Cargo output also lives under `.haneoka/`. A changed generated source fails the build.
The patch uses LF on every checkout. The adapter's `HANEOKA_PATCH_SHA` must match the patch bytes. The runtime descriptor and answers record both
the upstream commit and patch SHA-256; the complete patch is copied beside the runtime as `moenotes.patch`.
Generated WASM, bundled adapter, runtime descriptor, license and NOTICE live under ignored
`public/haneoka-team-engine/`. These outputs must be built together; the descriptor binds their sizes and hashes.

This uses Moenotes' existing **development-only** engine override. The production provider and its
model-commit checks are unchanged. This is an integration milestone, not a production migration.

## Data and model identities

The source dataset remains the published `nnnotes.deck-data/1`, verified by the existing replay
manifest's SHA-256 and size. Its `provenance.deck.commit` still identifies the original exporter/model;
it must not be rewritten to the Haneoka commit. The generated runtime descriptor identifies the Haneoka
scoring code separately. The Worker supplies the verified dataset hash to the adapter constructor;
the adapter binds its engine context and account requests to that exact dataset.

`src/lib/deck/haneoka/data.ts` maps columnar Master tables and every chart note, skill event and fever
interval into the Haneoka engine document. It preserves the source note order and uses the snapshot's
music duration. No chart approximation or independent scoring formula is introduced.

## Current capability boundary

- Power with optional parameter bonuses from one selected known event, with or without a normal song context.
  Parameter bonuses do not select challenge-song typing. Free Live, Challenge Live, Battle Live and Mission Live
  score searches; ordinary and Challenge Skip deterministic score searches (expected and maximum are identical).
- Skip score uses the native deterministic formula as its objective and bound. Nonnegative finite score factors
  are required for the power bound to remain monotone; an unsupported factor produces a diagnostic request error.
  It reads growth/player bonuses without requiring unused live skills, and returns no random-order statistics.
  Challenge Skip score uses challenge-song typing; parameter bonuses apply only when that challenge event is
  selected in `eventIds`, matching the source model. Ordinary Skip score ignores event parameter context.
- Free Live and Challenge Live single PT / event-item expected rewards; Free Live CP; ordinary Skip PT / CP /
  event items; Challenge Skip PT / event items. Ordinary consumption is 0 through 10; Challenge consumption is
  200/400/800/1600. Every positive cost must have exactly one matching source row.
- Combined expected rewards use up to three lexicographic levels, nine total PT / event-item / CP terms,
  and positive integer weights through 1,000,000,000. All terms refer to the same event. The existing page's
  manual conversion and automatic two-stage CP worth requests use this capability. Challenge routes cannot earn CP.
- Each combined level keeps an `i128` weighted sum of integer settlements. Only one level is projected to a
  monotone floating search key; exact vectors decide projected ties and final ordering. Lexicographic levels are
  never flattened into a large scalar. Bounds cover all reachable grades, with outward rounding. If signed Int32
  multiplication can wrap, PT/items use the universal settlement bound instead of assuming bonus monotonicity.
  Exact upper vectors cover every priority level; a branch is discarded only after `k` legal physical formations
  exist and its vector cannot beat the retained frontier. Character suffixes and remaining Snapshot matching
  tighten both PT and item bonuses while preserving the complete candidate pool.
- Combined top-K retains physical formations: leader, members and member-to-Snapshot assignments. It preserves
  Snapshot options and disables roster-level lower bounds that would otherwise discard distinct formations.
  Progress and final answers expose each level and term's exact sum/count. Played rewards average 120 skill orders;
  Skip has one deterministic settlement. A deadline preserves candidates and leaves the proof incomplete.
- Automatic CP conversion first computes the selected challenge reward, then passes its exact payoff/cost through
  the existing page request producer. Its worth remains the best found value if that first search is incomplete;
  downstream proof certifies the emitted weighted objective, not optimality of an unfinished challenge search.
- Reward results retain mean played score or deterministic Skip score in `value.score`, and selected expected
  reward in `value.payoff.score`. `value.payoff.exact` contains the integer reward sum and observation count.
  CP ranking compares CP directly. The score tie used by the upstream CP objective is disabled for these requests.
- Rewards use the page's `rewardProjection: true` and played/Skip clock. Projection excludes saved balances;
  the original model's half-open event window still applies. Int64 tick tokens are preserved before comparison,
  including the final 100 ns before an event ends. Dates follow the model's canonical no-offset JST interpretation.
- The account envelope uses the page's `jp` / `intl` identifiers. Skip reads growth and player bonuses without
  requiring unused live/Gekisou skill levels. Skip result grades follow the source enum parser: case-sensitive
  names, signed Int32 decimal strings and comma-separated named values combined with bitwise OR. Whitespace
  follows Unicode White_Space. Invalid or overflowing tokens resolve to enum zero, as in the source model;
  a selected grade missing from a requested PT/item/CP table is diagnosed before search.
- Expected or maximum skill-order score; declared Great/Just distributions and periodic misses.
- Required/excluded members, excluded Snaps, fixed leader and no-Snap requests.
- Progress, time limits and intermediate candidates use the existing Worker lifecycle. Only a
  completed Haneoka proof becomes a proven result. Formation slot 2 holds the leader.
- The time budget starts before request/account adaptation. Combined played rewards skip the unrestricted
  score-cap preparation pass. Free combined requests generate native score seeds with a 100 ms search budget, including
  legal leader rotations with Snapshot bindings preserved; the original full search evaluates every seed.
- Gekisou first replays one legal power proposal through native `evaluateAll`, with the requested accuracy and
  aggregation. This keeps the complete-search cache intact. Its scored candidate survives later preparation
  expiry and is always unproven until the original full request completes. It does not narrow that request.
  Preparation checks deadlines between member/Snapshot jobs and WASM support contexts. The budget is cooperative:
  one native operation and final result completion can exceed it. A zero budget returns no fabricated team.
- Unknown or conflicting account inputs remain missing/invalid. Relevant fields are checked before
  the engine's min/max growth policy can fill them.
- The verified JP and international snapshots have empty memory tables. Nonempty active memory
  tables are explicitly unsupported until their saved-state mapping is implemented.

Pending before production switching: other event scenes, maximum rewards, Arena scene
mapping, memory activation, cross-song UI and stopped-search continuation, full-range
performance and phone/browser acceptance. Existing production capabilities remain available
through the original provider during this work.

## Performance evidence

[Full-card-pool validation](haneoka-performance.md) records both servers, declared growth, exact model identities,
candidate/proof states, Worker-core coverage, and remaining latency and memory limits. Full-pool execution is
separate from complete browser/phone acceptance.

## Attribution

The engine's AGPL-3.0-only LICENSE and NOTICE are copied with the runtime and downstream patch. Changed Rust files carry a dated Moenotes modification notice. Haneoka result rendering
includes the NOTICE's translated attribution and an explicit link to https://haneoka.org. The site's license page also links to the pinned engine LICENSE and NOTICE.

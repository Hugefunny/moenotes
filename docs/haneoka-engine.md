# Haneoka engine integration

The Haneoka engine is pinned at `c91e6459a5ed43d55dc2b75e6a9d4f55b3edc62a`.
The existing Moenotes card pool, account envelopes, Worker lifecycle and result components are reused.
The independent Rust engine owns scoring and search; the adapter translates documents, goals and results.

## Local runtime

Install Bun, Git and Rust with the `wasm32-unknown-unknown` target, then run:

```sh
bun install --frozen-lockfile
rustup target add wasm32-unknown-unknown
bun run build:haneoka-engine
PUBLIC_DECK_RECOMMEND_ENGINE=/haneoka-team-engine/runtime.json bun run dev
```

In PowerShell, set `$env:PUBLIC_DECK_RECOMMEND_ENGINE='/haneoka-team-engine/runtime.json'` before `bun run dev`.

The build writes the external checkout and Cargo output under ignored `.haneoka/`.
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

- Power without event parameter bonuses; Free Live, Challenge Live, Battle Live and Mission Live score searches.
- Expected or maximum skill-order score; declared Great/Just distributions and periodic misses.
- Required/excluded members, excluded Snaps, fixed leader and no-Snap requests.
- Progress, time limits and intermediate candidates use the existing Worker lifecycle. Only a
  completed Haneoka proof becomes a proven result. Formation slot 2 holds the leader.
- Unknown or conflicting account inputs remain missing/invalid. Relevant fields are checked before
  the engine's min/max growth policy can fill them.
- The verified JP and international snapshots have empty memory tables. Nonempty active memory
  tables are explicitly unsupported until their saved-state mapping is implemented.

Pending before production switching: event reward/Skip goals, arbitrary reward priority levels and
CP conversion, Arena scene mapping, memory activation, cross-song UI and stopped-search continuation,
event-parameter power, full-range performance and phone/browser acceptance. Existing production capabilities remain available
through the original provider during this work.

## Attribution

The engine's AGPL-3.0-only LICENSE and NOTICE are copied with the runtime. Haneoka result rendering
includes the NOTICE's translated attribution and an explicit link to https://haneoka.org. The site's license page also links to the pinned engine LICENSE and NOTICE.

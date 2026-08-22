# 01: The two v1 debts

**What to build:** Close the two behavioural decisions v1 deferred. A pasted line with no separator is searched as a title in a Batch, exactly as it already is when typed alone. An import is refused while a Batch is running, and a late restore loses to a running Batch.

`parseBatchLines` in `src/app/release-search.ts` sets `artist: split?.artist ?? line`, which contradicts the comment three lines above it — *"a line with no separator is a title … never an artist"* — and the single-line path already obeys. The search panel's `busy` flag is local and nothing outside can read it; it needs to be a predicate the workspace can ask.

**Blocked by:** nothing.

**Status:** ready-for-agent

- [ ] `Loveless` pasted among five lines produces the same query kind as `Loveless` typed alone
- [ ] Importing a project while a Batch runs is refused, with a reason naming the Batch
- [ ] A late IndexedDB restore that lands mid-Batch is discarded, not merged — the same rule as an edit beating a late restore
- [ ] Both are covered where they live: the parse rule as a pure function, the refusal at the workspace seam

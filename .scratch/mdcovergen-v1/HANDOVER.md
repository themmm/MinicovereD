# Handover — mdcovergen v1 implementation

Written mid-run so a fresh session can pick this up without re-deriving anything.

## Where things stand

| Ticket | State |
| --- | --- |
| 01 app shell, PWA + single-file, fonts, attribution | **merged** — [PR #1](https://github.com/themmm/mdcovergen/pull/1) |
| 02 tracer bullet → exact-mm 300 DPI PDF | **merged** — [PR #2](https://github.com/themmm/mdcovergen/pull/2) |
| 03 SheetPacker, paper, margin, Part toggles | **merged** — [PR #3](https://github.com/themmm/mdcovergen/pull/3) |
| 04 MetadataAdapter (MusicBrainz + CAA) | **merged** — [PR #4](https://github.com/themmm/mdcovergen/pull/4) |
| 05 Template parameters, Full-bleed, MiniDisc logo | **merged** — [PR #5](https://github.com/themmm/mdcovergen/pull/5) |
| 06 Label presets, notch, calibration sheet | **merged** — [PR #6](https://github.com/themmm/mdcovergen/pull/6) |
| 07 tracklist overflow, Unicode hardening | **merged** — [PR #7](https://github.com/themmm/mdcovergen/pull/7) |
| 08 autosave + project files | **merged** — [PR #8](https://github.com/themmm/mdcovergen/pull/8) |
| 09 batch queue | **committed on `ticket-09-batch-queue`, not yet reviewed or merged** |
| 10 release polish | **not started** |

208 tests, `tsc --noEmit` clean, both builds green.

## Finish ticket 09 first

Branch `ticket-09-batch-queue` has one commit. Still to do:

1. **Run the end-to-end verification.** `/private/tmp/.../scratchpad/verify-t09.mjs` drives the
   batch of five (one deliberately unfindable), checks the queue rows, reorder, remove, and the
   packed multi-Release PDF. It needs **more than two minutes** — five Releases × ~3 requests
   through a 1 req/s throttle — so run it backgrounded. It had not finished when this was written.
2. **Known gap:** a queue entry's `status`/`error` is not persisted. Reload turns a flagged entry
   into an ordinary empty Release. Arguably right (a stale error helps nobody) but it is a decision
   nobody has written down — either persist it or say why not.
3. ~~`renderControls()` rebuilt the column on every keystroke, destroying focus.~~ **Fixed** in
   commit `796e32e`: rebuilding is for selection changes only. Verified with real key events —
   nine characters land and the caret tracks them.
4. Then run the review (see below), fix, PR, merge.

### Things the reviewer should be pointed at for ticket 09

- `resolveBatchIntoQueue` returns every entry, duplicates included; the *caller* dedupes via
  `addToQueue`. Two searches resolving to the same MusicBrainz release is a real case — the
  workspace reports "N of those Releases were already in the queue". Check that reads correctly.
- `queue-panel.ts` renders the whole list on every `show()`. Fine at these sizes; worth a glance.
- The example Release is re-inserted when the last entry is removed, so the queue is never empty.
  That is a placeholder decision ticket 10 revisits with the empty state.

## Ticket 10 — what it asks for

`.scratch/mdcovergen-v1/issues/10-release-polish.md`: offline caching of fetched artwork; an
empty/onboarding state leading to the first Release; a final ADR-0003 attribution completeness
check; the single-file HTML artifact as a release deliverable.

Notes for it:
- Artwork already becomes a `data:` URL inside the Release and is autosaved to IndexedDB, so
  "renders and exports previously fetched designs while offline" may already hold — **verify it**
  with the offline harness rather than assuming.
- The empty state replaces `EXAMPLE_RELEASE` in `src/app/workspace.ts`, which is marked with a
  comment saying exactly that.
- The attribution test already fails if a shipped npm package is unattributed. The completeness
  check is about assets and data sources.

## The workflow being followed

Per ticket, exactly as the user specified:

1. `git checkout -b ticket-NN-slug` **before** writing anything. Never commit to `main`.
2. Implement test-first at the seams. Run `npx tsc --noEmit` and `npx vitest run` constantly.
3. Review with a subagent (below), fix the findings in a second commit.
4. `gh pr create` → `gh pr merge N --squash --delete-branch` → `git checkout main && git pull`.
5. **No `Co-Authored-By` trailers.**

### Reviewing

Spawn **one** general-purpose subagent doing both axes (Spec and Standards) in a single report —
two parallel agents were killed mid-run once when the machine was loaded. Give it:
- the diff command and the ticket path,
- `git show HEAD:CONTEXT.md` and `docs/adr/*` as the documented standards,
- the Fowler smell baseline as judgement calls,
- a **hard rule not to create any file inside the repo** (one review left a scratch test behind and
  a blanket `git add -A` swept it into a commit),
- specific correctness questions about the riskiest code in that ticket.

**Stage explicitly — never `git add -A`.** Other sessions are editing this repo.

## Conventions this codebase has settled into

- **Everything is millimetres.** `Mm = number`; only `units.ts` converts, to raster px and PDF pt.
- **Three seams carry the suite**: SheetRenderer (geometry as a layout model), SheetPacker
  (rectangles), MetadataAdapter (recorded fixtures, never live). System boundaries — canvas, HTTP,
  clock, IndexedDB — are the only things faked.
- **SheetRenderer is pure.** Text measurement is injected. The rasteriser and the PDF writer are
  two readers of one layout model, which is why preview and export cannot drift.
- **SheetPacker is generic** (`PackItem<T>`): the calibration sheet uses it for outlines that are
  not Parts. Do not reimplement shelf packing anywhere.
- **Templates return `PartDrawing { ops, warnings? }`** — what was drawn and what to say about it,
  so a warning always describes the actual drawing.
- **Untrusted input is validated at the edge**: `readProjectFile` never throws and never
  half-applies; colours go through `safeLogoColor` because they end up in SVG markup.
- Comments say *why*. The house style is plain, specific prose — see any file in `src/render`.

## Verification harness (in the scratchpad, not the repo)

`/private/tmp/claude-501/-Users-timo-git-mdcovergen/<session>/scratchpad/` holds:

- `cdp.mjs` — minimal Chromium DevTools driver (`launch`, `newPage`, `evaluate`, `waitFor`, `goto`)
- `serve.mjs` — static file server
- `verify-offline.mjs` — kills the origin server and proves the SW serves the app, **with a negative
  control** that must fail
- `verify-export.mjs`, `verify-t0*.mjs` — per-ticket end-to-end drivers
- `measure-square.mjs` — scans the rendered raster for the calibration square's own edges

**These are worth recreating if lost.** Every ticket was verified by driving the built app in
Chromium, not only by unit tests — that is what caught the CORS failure in 04, the fold guides
printing inside the margin in 02, and the unloaded CJK font in 07.

## Things a fresh session must know

- **Three other Claude sessions are working in this repo.** They have added `docs/adr/0007` and
  `0008` (naming criteria; visual register) and glossary entries to `CONTEXT.md` — all currently
  **uncommitted or untracked in the working tree**. Leave them alone; stage only your own files.
- **`CONTEXT.md` needs a correction** nobody has made: it defines Label as *"Rectangular, with one
  diagonally cut corner"*, but the Full preset ships `notch: false`. I did not edit it because
  another session is actively editing that file.
- **MusicBrainz rate-limits by IP.** Probing earns 503s that persist for minutes. Space live checks
  out, and remember the adapter now retries 503 twice with backoff.
- **The `protect-main` ruleset is currently `disabled`** on GitHub, but the PR-only workflow is
  being followed regardless, as instructed.
- ADR-0006 records why the MusicBrainz User-Agent requirement cannot be met client-side.

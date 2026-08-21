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
| 09 batch queue | **merged** — [PR #9](https://github.com/themmm/mdcovergen/pull/9) |
| 10 release polish | **reviewed, fixed, ready to merge** — branch `ticket-10-release-polish` |
| 11 register, rename, Part preview | **not started** — written by another session; read ADR-0008/0009/0010 first |

239 tests, `tsc --noEmit` clean, both builds green.

## What ticket 09 turned into

The end-to-end run found three things the unit tests could not.

**A batch reported its outcome into a panel that had just been replaced.** Handing the Releases
over changes the selection, which rebuilt the whole controls column, so the sentence saying how
the batch went was written to a detached node and never appeared. That is also why the live
verification looked like it was hanging: it was waiting for a message the app was throwing away.
Fixed by building the column once and rebuilding only the three panels that *are* a view of the
selected Release.

**Nothing bounded a request.** Every request goes through one serialised throttle, so a connection
that is accepted and never answered would have wedged the whole metadata layer permanently. This
was not hypothetical — a live run caught the Cover Art Archive redirecting to storage nodes that
failed after 10.8 s and 20.3 s, and a MusicBrainz search that never answered at all. Both services
now get a deadline at the network boundary (`AbortSignal`, so the request is cancelled rather than
merely abandoned), and the Archive is not asked for a second image size once it has proved
unreachable — both sizes come off the same node. A live batch of five went from timing out past
180 s to finishing in 53 s, with the hung search aborted at exactly 15 s and the batch carrying on.

**An unfinished queue entry did not survive a reload** — the open decision the previous handover
left. It does now: the project file records *that* an entry still needs completing by hand,
because that flag is the collector's to-do list, but not the *reason*, which was true of one
moment on one network. `Project` therefore carries queue entries rather than bare designs.
`PROJECT_VERSION` is deliberately **not** bumped — the reader refuses anything newer than it
knows, so bumping would have made new files unreadable by the previous build for the sake of a
field that is additive and optional anyway.

Also fixed from the review: the example Release is displaced by the collector's first real work
(a batch of five was leaving a queue of six); the batch summary counts what actually joined the
queue; a pasted line is keyed by its text, not its position, so the same unfindable line twice is
one Release; the queue list keeps its scroll position and puts the keyboard back on the button
that was pressed; `pick()` can no longer strand the search panel disabled.

### Deliberately not done in ticket 09

- **An import or a late restore can land while a batch is running.** The batch's entries are then
  appended to the newly-imported queue, a few seconds after the app said "your previous work has
  been replaced". Needs a `busy()` predicate on the search panel. Real, rare, not a crash.
- **A pasted line with no separator is searched as an artist.** Sending it as an unfielded
  free-text query — what MusicBrainz's own search box does — would find both artists and albums,
  but it changes `searchTerm` in the adapter, which is a shared seam and a product decision.
- **A single lookup inherits the selected Release's template and colours; a batch entry gets the
  defaults.** Same user intent, two outcomes. Worth deciding deliberately rather than by accident.
- **CONTEXT.md needs `Queue` and `Queue Entry`.** Both are now load-bearing — a type, a directory,
  a panel heading, a persisted flag — and the glossary has neither. Not done because another
  session has uncommitted edits to that file (see below).

## What ticket 10 turned into

Two of its four criteria **already held**, and were verified rather than assumed.

- *Offline, including artwork.* Artwork is a `data:` URL inside the Release and the shell is
  precached, so nothing has to be re-fetched. `verify-t10-offline.mjs` takes away all four sources
  — HTTP cache disabled, network emulated offline, origin server killed, metadata stub failing
  every request — and finds the queue restored, the cover art with it, the Sheet rendering
  pixel-identically to the online render, and a 210×297 mm PDF exported with no network at all.
- *The single-file artifact.* `verify-t10-singlefile.mjs` loads it over `file://`: nothing left to
  fetch, no service worker, all nine unicode-range font subsets inlined, and a Release typed by
  hand exporting a PDF.

The other two needed work.

**The empty state.** The example Release is gone. A first visit opens on a panel naming both routes
to a first Release, placed *first* in the column — onboarding below the fold is not onboarding —
and swapping with the Queue panel rather than sitting beside it. Removing the last Release leaves
the empty state instead of resurrecting a placeholder, and takes the Sheet off the canvas with it.
The Queue panel carries the same "add by hand" route, because a mixtape is not something a database
can be asked for and a collector has more than one.

One trap worth knowing: **starting a Release counts as an edit, and an edit beats a late restore.**
A returning collector who pressed the button before IndexedDB answered would have lost their whole
queue, silently. The button waits for the store and says so. The broader version of that race —
a batch or an import landing while the restore is in flight — is still open; see below.

**Attribution completeness, which found a real gap.** `workbox-window`, `workbox-core`,
`workbox-precaching`, `workbox-routing` and `workbox-strategies` all ship in the hosted build —
vite-plugin-pwa compiles two into the page and workbox-build generates the service worker out of
the rest — and none were credited. The old check could not see them: it walked the runtime
`dependencies`, and workbox arrives through a devDependency.

The check now covers three things it did not:
- **packages that ship without being dependencies**, listed explicitly and then *verified against a
  real build* — workbox stamps its own module names into its own code, so when `dist/pwa` is
  present the suite reads them back and fails if the list has drifted;
- **assets**, under `assets/`, `public/` and `src/` alike: every file that is not code must be
  attributed or claimed as this project's own work. A font dropped under `src/` used to ship
  unexamined;
- **the single-file build's dialog**, which was crediting workbox it does not contain.

Both new checks were confirmed by making them fail on purpose, not by trusting a green run.

### Deliberately not done in tickets 09 and 10

- **An import or a late restore can land while a batch is running.** The batch's entries are then
  appended to the newly-imported queue, seconds after the app said "your previous work has been
  replaced". Needs a `busy()` predicate on the search panel. Ticket 10 closed the version of this
  that the empty-state button opened; this one is older and wider.
- **A pasted line with no separator is searched as an artist.** Sending it as an unfielded
  free-text query — what MusicBrainz's own search box does — would find artists and albums alike,
  but it changes `searchTerm` in the adapter, which is a shared seam and a product decision.
- **A single lookup inherits the selected Release's design; a batch entry gets the defaults.**
  Same user intent, two outcomes. Worth deciding deliberately rather than by accident.
- **`CONTEXT.md` needs `Queue` and `Queue Entry`,** and a correction to `Label`. Blocked on another
  session's uncommitted edits to that file — see below.
- **The version is still `0.1.0`,** which is what the app tells MusicBrainz it is (ADR-0006). That
  is accurate today: ticket 11 exists, so v1 is not finished. Bump it when it is.

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

- `cdp.mjs` — minimal Chromium DevTools driver (`launch`, `newPage`, `evaluate`, `waitFor`, `goto`,
  and `on(method, handler)` for CDP events, which is what request interception needs)
- `serve.mjs` — static file server
- `mb-stub.mjs` — MusicBrainz and the Cover Art Archive, answered at the browser's network boundary
  from the repo's own fixtures, rewritten per query so five searches resolve to five different
  Releases. The app, the adapter, the throttle and the queue are all real; only the far side of
  `fetch` is recorded. `cut()` then fails every request, which is the negative control for offline.
- `verify-offline.mjs` — kills the origin server and proves the SW serves the app, **with a negative
  control** that must fail
- `verify-t09-stub.mjs` — the whole of ticket 09 deterministically: nineteen checks from the batch
  of five through reorder, remove, Part toggles and the packed PDF to a reload. **Use this one**;
  the live driver depends on two third parties having a good day.
- `verify-t10-empty.mjs`, `verify-t10-offline.mjs`, `verify-t10-singlefile.mjs`,
  `verify-t10-about.mjs` — ticket 10's four criteria, one driver each
- `probe-t09-live.mjs` — drives a live batch and prints every request with how long it took and how
  it ended. This is what found the Cover Art Archive latency; reach for it when live and stubbed
  runs disagree.
- `verify-export.mjs`, `verify-t0*.mjs` — per-ticket end-to-end drivers
- `measure-square.mjs` — scans the rendered raster for the calibration square's own edges

**These are worth recreating if lost.** Every ticket was verified by driving the built app in
Chromium, not only by unit tests — that is what caught the CORS failure in 04, the fold guides
printing inside the margin in 02, and the unloaded CJK font in 07.

## Things a fresh session must know

- **Other Claude sessions are working in this repo.** They have added `docs/adr/0007`, `0008` and
  `0009` (naming criteria; visual register; the name — the project is to be renamed
  **MinicovereD**) and glossary entries to `CONTEXT.md`, all currently **uncommitted or untracked
  in the working tree**. Leave them alone; stage only your own files. Note that 0008 governs the
  visual register, so anything that changes how the app *looks* — the ticket 10 empty state
  included — should stay functional and neutral rather than making brand decisions in their lane.
  They have since added ADR-0010 and ticket 11, which is where that work lands.
- **MusicBrainz rate-limits by IP.** Probing earns 503s that persist for minutes. Space live checks
  out, and remember the adapter retries 503 twice with backoff. The Cover Art Archive is a separate
  problem: it redirects to `*.archive.org` storage nodes whose latency swings between two seconds
  and never. Both are why the stubbed driver, not the live one, is the repeatable check.
- **CONTEXT.md needs two things nobody has done**, both blocked on another session's uncommitted
  edits to that file: `Queue` and `Queue Entry` glossary entries, and a correction — it defines
  Label as *"Rectangular, with one diagonally cut corner"*, but the Full preset ships
  `notch: false`.
- **The `protect-main` ruleset is currently `disabled`** on GitHub, but the PR-only workflow is
  being followed regardless, as instructed.
- ADR-0006 records why the MusicBrainz User-Agent requirement cannot be met client-side.

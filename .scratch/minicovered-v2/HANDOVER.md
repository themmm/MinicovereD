# Handover — MinicovereD v2, released

Written at the end of ticket 09, which is the last ticket in 2.0. This is a **release** handover
rather than a ticket one: what v2 is, what changed for a collector who used 1.1, what a version-1
project file does when it is opened, and every decision left open across 06–09.

## Where things stand

| Ticket | Release | State |
| --- | --- | --- |
| 01 v1 debts — a pasted title is a title, a Batch outranks an arriving project | 1.1 | **merged** — PR #22 |
| 02 five OFL voices, and a print stack per Template | 1.1 | **merged** — PR #23 |
| 03 Classic bleeds three edges, every Template draws its own tracklist Page | 1.1 | **merged** — PR #24 |
| 04 Minimal, a Template that is type and nothing else | 1.1 | **merged** — PR #25 |
| 05 Discogs credits, in a field of their own | 1.1 | **merged** — PR #26 |
| 06 measurements are settings, design is per Release | 2.0 | **merged** — PR #27 |
| 07 SheetPacker turns a Part | 2.0 | **merged** — PR #28 |
| 08 the Insert | 2.0 | **merged** — PR #29 |
| 09 migration to version 2, and the documents | 2.0 | this branch |

**631 tests in 31 files** (ticket 08 finished at 615 in 30). `npx tsc --noEmit` clean, `npm run build` green. Single-file artifact
**2,958,347 bytes** — **1,235,957 under the 4 MiB ceiling**, or 1,041,653 under a decimal 4 MB. 21
woff2 files in the hosted build. No fonts were added after ticket 02.

The ceiling is enforced rather than remembered, in `src/pwa/built-artifacts.test.ts`: it fails when
the single-file build crosses 4 MiB, when the two builds carry different numbers of woff2, or when a
font survives as a path rather than a data URI. It **skips without a build**, as do the workbox
checks in `src/attribution/attributions.test.ts`, so run `npm run build` before trusting a green
suite on those.

## What v2 is

**1.1 was additive.** It read and wrote `PROJECT_VERSION` 1 and broke no saved file. It closed the
three debts v1 shipped knowingly, gave the Templates typographic range and a reason to differ, and
added Discogs credits (ADR-0013). Five bundled OFL voices arrived beside Noto, `--font-print` became
per-Template, Classic's artwork learned to bleed three edges, every Template gained a tracklist Page
of its own, and **Minimal** arrived for mixtapes.

**2.0 is the format break.** The **Insert** (ADR-0012) replaces the J-Card and the Back Card as one
folded strip: Inner Flap 14 + Spine 5.5 + Front Panel 68 + Pages at 65 mm, height 79, folded
concertina with the printed side out, living entirely inside the front of the case. `PartKind` went
from three members to two. Measurements left the Design and became the collector's settings
(ticket 06). `SheetPacker` learned to turn a Part rather than the Sheet (ADR-0014). Project files are
format version **2**, and a version-1 file migrates on read.

**The gate held.** No Insert renderer code was written until a printed strip had been cut and folded
and ADR-0012's three questions answered on paper. All three came back in favour: a four-Page folded
stack seats in a front cover designed for one card, the J-Card end still holds it, and the tracklist
is **not** missed — one piece is the better object, which is the answer ADR-0012 had accepted as a
cost rather than expected to win. ADR-0005's reversal therefore stands on measurement.

## What changed for a collector who used 1.1

- **Two Parts instead of three.** One Insert and one Label. The Back Card is gone; its tracklist is a
  Page inside the booklet, and the case's back slot stays empty. A shelved case no longer shows its
  tracklist, and that cost is accepted with eyes open.
- **The Insert folds.** Two Pages normally, four when there is a second thing to say — credits, or a
  tracklist too long for one Page *and* a back cover to fill out the four. The odd Page out reprints
  the artwork. The count comes from the record; a control (`#design-pages`, `auto` / `2` / `4`)
  overrides it for one Release and deliberately does not carry forward.
- **Three kinds of fold, three dash patterns.** `case`, `fore-edge` and `spine`, marked differently
  on the printed Sheet, because that is the only instruction a collector gets. All three stay dashed:
  the cut outline is the only solid line, and a solid fold is a line somebody could cut along.
- **The Parts band shows two specimens.** *Assembled* is the closed booklet — 73.5 × 79 whatever the
  Page count, the same box a v1 J-Card's assembled view had, which is what keeps ADR-0010's one
  shared scale working. *Flat* is the whole strip, 152.5 mm at two Pages and 282.5 at four, so the
  band scrolls sideways and the page does not.
- **Measurements are set once, for every Release.** In 1.1 the Label control wrote to the selected
  Release and to nothing else, so a project could hold a Label per Release. There is one set now,
  held by the app, and it travels in a project file — an import says so, field by field, naming only
  the numbers that actually moved.
- **A Page a Release wanted and the paper could not take is reported, not silently dropped.** With
  the numbers to fix it where there is a fix, and with no advice where there is none.
- **Letter takes two Pages, at every margin including zero.** 282.5 mm of strip against a 279.4 mm
  long edge. ADR-0014's arithmetic checked A4's 287 and never checked the other paper this app
  offers. A Letter collector is told which Page went and why, every time.
- **`DEFAULT_PART_GAP_MM` is 3.5, not 4.** Of the four numbers in ADR-0014's one-Sheet sum it is the
  only one that is not a measurement of physical hardware — the Insert's height is a front cover, the
  Label's width is a cartridge, the printable margin is a printer, and this is scissor room. Two
  turned Inserts and a column of Labels now really do fit one A4 Sheet, which is what that table
  always claimed.

## What a version-1 project file does when it is opened

It opens. Nothing has to be exported first. `PROJECT_VERSION` is 2 and a version-1 file is read
rather than refused; a version-**2** file is still refused by a version-1 reader, with the message
that has always been there.

- Its `jcard` and `back-card` toggles collapse to one `insert` toggle (`LEGACY_PARTS` in
  `project-file.ts`). Mapping them rather than filtering matters for the one case where it shows: a
  collector who printed J-Cards only would otherwise fall through to "everything" and get Labels they
  had switched off.
- Its `jcard` block becomes the Insert's first four measurements — the same lengths off the same
  case. `pageWidth` has no v1 source and takes the default 65.
- **Its `backCard` block is deliberately not read.** The Back Card's 69 mm width has no counterpart
  on the strip, whose Pages are 65 mm by the case rather than 69 by the old rectangle.
- The first Design that states any `dimensions` becomes the project's measurements. v1 really could
  hold one Label per Release, and there is no shape left to express that in; the first Release is the
  one selected after an import, so it is the one whose Parts the collector is looking at when they
  judge whether their measurements survived.
- **It does not necessarily open as a queue of 2-Page Inserts**, and the difference is a feature. No
  `pageCount` is read from a version-1 file, so the count is derived from the content — and the
  content has **two** independent ways to ask for four Pages. Credits are one, and only a 1.1 file can
  carry them. A tracklist too long for one Page on a Template that has a back cover is the other, and
  a **1.0** file reaches four Pages that way with no credits anywhere near it: 41 tracks is the
  threshold at a 79 mm Page. The version decides exactly one thing — whether an omitted
  `insetArtwork` means the v1.0 inset square. ADR-0012's migration paragraph claimed the file opened
  at two and was corrected in ticket 08; ticket 09 then wrote "a 1.0 file opens at two" into four more
  documents and a test before the review caught it, which is what a fixture whose only long tracklist
  belongs to Minimal will do to you.
- Inside version 1, a Design that omits `insetArtwork` was written by 1.0 and gets the inset square
  it was drawn with. From version 2 that tell is retired: a version-2 file that omits the key was not
  written by this app, so reading a 1.0 convention into it would be guessing about a document that
  predates nothing.

`src/persist/version-one-migration.test.ts` opens a whole realistic 1.1 document — four Designs, a
`dimensions` block on each, a Sheet still naming the J-Card and the Back Card — and then **prints**
it, because "nothing lost" is a claim about the paper and not only about the parse. It also opens the
same project as 1.0 wrote it, and the same project saved for Letter.

## Decisions left open across 06–09, that a fresh session can reopen

- **`DEFAULT_PART_GAP_MM` is 3.5.** The one most likely to be questioned. The reason is in the
  constant's own comment and in ADR-0014.
- **The credits Page's *flow* is shared and its *surface* is the Template's** — ticket 03's rule
  applied to a second list. If a credits block is a design decision rather than a fact about
  `Credits`, `drawCredits` in `templates/shared.ts` is the thing to argue with.
- **`LIST_TOP_MM = 16` in `tracklist-layout.ts` is the box the Page count is derived against**, chosen
  as the roomiest of the three Templates (Minimal's 16 against Full-bleed's 18 and Classic's 19).
  `sheet-renderer.test.ts` holds every Template to starting its list no higher than it, so the
  "roomiest" claim cannot go stale silently.
- **The Page count is Template-dependent through `hasBackCover` alone.** Not a fit/taste violation:
  the count is a Design fact rather than a Measurement, and what a back cover *is* is genuinely the
  Template's business. The alternative was a Template-blind count, which would have handed Minimal a
  Page it draws nothing on.
- **There is no app-level Page-count default, on purpose.** The spec named one under app settings and
  it was not built: every field in `Measurements` is a length in millimetres, which is what the name
  is for, and a count is not one. The derived count already is the default and a better one.
- **The override lives on `ReleaseDesign`, not on `DesignChoice`.** A Design choice carries forward,
  and a four-Page override carried onto the next Release would fold Pages for content that is not
  there.
- **`InsertPagesShort` has no `cause` field.** The UI compares `maxPages` to `requestedPages` to tell
  "the paper had no room" from "the content could not fill the Pages", and reads
  `requestedByCollector` to choose between *"You asked for 4 Pages"* and *"This Release needs 4
  Pages"*. Two sentences built from one shape cannot drift.
- **`describeDropped` is exported from `part-band.ts` and imported by `sheet-preview.ts`.** Two app
  modules, one sentence fragment, so the band and the Sheet check cannot disagree about what was lost
  or how many things it was — the fragment carries its own verb for that reason. A shared
  `warnings-text.ts` would be tidier; moving it is churn for one function, and
  `src/app/part-band.test.ts` is where the verb agreement is pinned.
- **Three ADRs were edited rather than only referenced**: 0012, 0014 and 0010. Ticket 07 set that
  precedent. If editing accepted ADRs is wrong, that is the thing to argue with.
- **The end-to-end migration test lives in its own file** rather than in `project-file.test.ts`. The
  readers are tested field by field there; this is the whole document, it needs a big fixture, and it
  reaches the renderer. Not a fourth seam — the precedent is `insert-plan.test.ts`.
- **`package.json` is still `1.0.0`.** 1.1 and 2.0 both completed without a version bump, and the
  version is what reaches MusicBrainz as `client=minicovered-1.0.0` and in the User-Agent (ADR-0006),
  and what README line 16 documents as the technical form. Left alone in ticket 09 because bumping it
  changes what a third-party service sees and the ticket did not ask. **This is the one release step
  that has not been taken.**
- **The v1 spec's backlog line was rewritten rather than deleted**, to say what became of each item.
  The v2 spec was corrected in four places with "As built" notes rather than rewritten, so the
  original decision stays legible beside what shipped.

## Known limitations, shipped deliberately

- **A Letter collector can never print a credits Page.** They are told why, clearly, every time.
  Narrower Pages on Letter would fix it and ADR-0014 explicitly rejects paper-driven Page widths; a
  second strip is out of scope. Left as a known limitation rather than solved badly.
- **The Insert's four case measurements have no controls** — Inner Flap, Spine, Front Panel, height —
  and are reachable only by hand-editing a project file. `measurements.ts` argues they are what a
  *case* decides rather than a collector. The Page width got a control because 65 mm is a booklet
  number, not a case number.
- **Six Pages and a second strip are out of scope.** `MAX_INSERT_PAGES = 4`.
- **An unplaceable Part still throws, and can no longer happen in practice.** The Page count is
  capped by the paper before anything is packed, so a margin above 7.25 mm — or Letter at all —
  produces a two-Page Insert rather than an unplaceable four-Page one. A two-Page strip is 152.5 × 79
  and fits every paper at every margin the control reaches. What survives of the throw is a
  hand-edited project file, which is what it was written for.
- **The calibration sheet cannot draw the Insert whole.** It draws at 1:1 in paper coordinates and
  never turns a figure, so a 282.5 mm strip would be omitted at every margin including zero — and the
  footer would then advise reducing a margin that cannot help. It prints **`Insert — case end`**
  (87.5 × 79, both case folds marked) and **`Insert — one Page`** (65 × 79), which is what a
  collector actually holds a case and a cartridge against, plus the strip's own lengths as numbers.

## v2.1 backlog

New in ticket 09:

- **Bump `package.json` to 2.0.0** and follow it through: `APP_VERSION` feeds
  `client=minicovered-<version>` and the User-Agent, and README line 16 quotes the string.
- **ADR-0006 still says `client=mdcovergen-0.1.0`.** Pre-rename and pre-1.0, and a statement of
  present fact that is false. Left alone because the ADRs deliberately keep their original voice (0005
  says "mdcovergen" too), but somebody should decide whether that convention covers a literal that
  the code has since changed.
- **A short Release id renders as `MusicBrainz mb-1…mb-1`.** `workspace.ts:431` is
  `${id.slice(0, 4)}…${id.slice(-4)}`, which repeats itself for any id under eight characters. Only
  reachable from a hand-edited project file — a real id is a 36-character MBID or is `hand-` prefixed
  — so it is cosmetic, on untrusted input, and was left.
- **The `.spec__note` cap snaps at both ends of the collapse.** The fix in ticket 09 stops a warning
  being clipped at rest, and the cost is two snaps for a note taller than 90 px: condensing drops it
  to 90 before the 380 ms collapse begins, and un-condensing opens it to full height at once, `none`
  being no length to interpolate from. A `grid-template-rows: 1fr → 0fr` collapse would animate both
  ways with no number in it — the number is the part that goes stale — at the cost of an inner wrapper
  element and a fresh look at the condense animation.

Still open from earlier tickets and still true:

- **Minimal's headline is ellipsised in silence** while the Spine and the tracklist both warn.
- **The credits Page's typography is thin** — one word of heading and a two-column flow. Honest, and
  not designed the way the tracklist Page is.
- **`LABEL_PAD = 2.5` duplicates Classic's local `pad`.**
- **A short title leaves ~30 mm of blank paper** on Minimal's Front Panel.
- **A Release restored from a file never fetches credits.** `Release.discogsId` is persisted and read
  by nothing: only a lookup asks for credits.
- **`Release.notes` still holds MusicBrainz's `label · catalog-number`** beside Discogs' own in
  `Release.credits`.
- **A 25-Release Batch writes the whole project 25 more times.**

## Conventions a fresh session must keep

- Everything is millimetres. `Mm = number`; only `units.ts` converts.
- **Three test seams**: SheetRenderer, SheetPacker, MetadataAdapter. Do not invent a fourth.
  `insert-plan.ts` is a module with a test file, not a seam — the precedent is `tracklist-layout.ts`.
- SheetRenderer is pure; text measurement is injected. Do **not** change `testMeasurer` in
  `sheet-renderer.test.ts` — it is face-blind on purpose.
- `src/persist/project-file.ts` is the app's only untrusted input. Every field is validated and no
  read ever throws. `readPageCount` **refuses** an odd or out-of-range count rather than clamping it.
- **Comments say WHY, in plain specific prose, and every factual claim in one has to be true.** The
  pattern that has caught false ones repeatedly: a comment that explains a behaviour by a mechanism,
  or that counts, or that cites a number — check the mechanism, run the count, do the arithmetic, and
  check *which* code path the mechanism actually takes. Ticket 09 found five more — three counting
  three Parts, one counting three toggles where the most any Template reads is two, and one
  user-visible line advertising the app as the retired J-Card's 87.5 mm.
- **Never edit a source file with `perl -pi`.** It reads UTF-8 as latin-1 and double-encodes every em
  dash already in the file. Use `python3` with `encoding='utf-8'`, or an editor tool, and
  `assert s.count(old) == 1` before every replace.
- Verify in a browser, not only in unit tests. The CDP recipe is in project memory. Ticket 09's own
  numbers: **25 browser checks** against the shipped single-file artifact, and mutation rounds of 16,
  14, 6 and 7 on the unit suite and 13, 3 and 2 in the browser, all caught. Two of those rounds paid
  for themselves: one found that **every clamp in the project reader was pinned from above and none
  from below**, and one found that **deleting `'back-card'` from `LEGACY_PARTS` left the suite green**.
  Both are now one test each. The one bug no number found was found by looking at the screenshot —
  and the one false *rule* no mutation found was found by the review, because a fixture cannot
  disprove a claim it was built to agree with.
- Do not touch MusicBrainz or Discogs live. Both rate-limit by IP; Discogs' anonymous budget is 25
  requests a minute.

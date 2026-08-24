# Spec: MinicovereD v2

Written after a full design interview; every decision below was put to the user and answered. The
reasoning lives in ADRs 0012–0014 and in CONTEXT.md. This file is the scope, the sequence and the
seams, not the argument.

## Problem Statement

v1.0.0 ships and works: search MusicBrainz, get a J-Card, a Back Card and a Label, pack them onto A4,
export an exact-millimetre PDF. Three things about it are wrong in the collector's hands.

**The set is three loose pieces of paper.** Cutting three rectangles per Release and getting two of
them into a case is fiddly, and the Back Card is a separate cut for something that could hang off the
J-Card and fold.

**A long tracklist has nowhere to go.** It shrinks until it hits the print floor and then warns.
There is no way to add a Page, and no way to say anything about the record beyond its track titles.

**It looks functional.** The Front Panel insets its artwork as a square; the Back Card is paper, two
lines, a hairline rule and a list; both Templates share that same Back Card, so choosing a Template
changes less than it appears to. Everything prints in one typeface.

Alongside these, v1 knowingly shipped three deferred decisions, all recorded in its handover.

## Solution

Two releases, split at the file format.

**1.1** — additive only, reads and writes `PROJECT_VERSION` 1, no saved file breaks. Closes the three
v1 debts, gives the Templates typographic range and a reason to differ, and adds Discogs credits.

**2.0** — the format break. The **Insert** replaces the J-Card and the Back Card as one folded piece
(ADR-0012), measurements separate from taste, `SheetPacker` learns to turn a Part (ADR-0014), and
project files migrate to version 2.

## Decisions

### The Insert (ADR-0012)

- A Release has **two** Parts: **Insert** and **Label**.
- The Insert is one strip: Inner Flap 14 + Spine 5.5 + Front Panel 68 + Pages at 65 mm, height 79.
- It lives **entirely in the front cover**. The back slot stays empty. The shelf-readable tracklist is
  knowingly given up.
- **Concertina, printed side out.** Pages run in reading order along the flat strip; folds alternate
  fore-edge / spine / fore-edge; blank always meets blank; it pages like a book.
- **Page count is always even.** Four Pages is the A4 maximum — 282.5 mm of 287 usable.
- Page count derives from content with a manual override: two Pages normally, four when the tracklist
  overflows or credits exist. The odd Page out repeats the artwork as a back cover. A mixtape is
  always two Pages.
  - **As built, the overflow half of that is conditional** (ticket 08): a tracklist too long for one
    Page produces four only when there is a back cover to fill the fourth. Credits are enough on
    their own. That is the even-Page rule doing its work rather than a special case — a Page nothing
    would go on is not folded — and it is also *why* a mixtape is always two Pages, so the last
    sentence above is a consequence rather than a rule of its own.

### Metadata (ADR-0013)

- Discogs joins MusicBrainz for **credits and release facts only** — `extraartists`, label and
  catalogue number, country, year, genres. Queried once per resolved Release.
- **Not** the `notes` field: measured, it is matrix runouts and label variants, not liner notes.
- **No API key field** — reads need none; 25 req/min unauthenticated, CORS open.
- **No free-text prose field.**

### Sheets (ADR-0014)

- `SheetPacker` places items rotated 90°. **No Sheet orientation anywhere.**
- Turned, two Inserts and a column of five Labels fit one A4 portrait Sheet.
- A printable margin above 7.25 mm makes a four-Page Insert unplaceable, and the app must say so.
  - **As built it is never unplaceable, and the saying-so is what shipped.** The Page count is chosen
    against the paper before anything is packed, so a margin above 7.25 mm — or **Letter at any
    margin, including zero**, which this arithmetic never checked — produces a two-Page Insert and an
    `InsertPagesShort` report naming the Pages that went and why. A two-Page strip is 152.5 × 79 and
    fits every paper here at every margin the control reaches.

### Templates and type

- **Classic changes**: artwork bleeds top, left and right; type sits on solid paper below. The inset
  square stays reachable as a parameter.
- **Each Template draws its own tracklist Page.** `drawBackCard` stops being shared — Full-bleed
  having no tracklist treatment of its own is the bug this fixes.
- The tracklist Page takes the Release's colour as a full-bleed ground with type reversed out, tracks
  set as a proper two-column table with durations.
- **Minimal**, a third Template: type only, no artwork. It exists for mixtapes, which get no artwork,
  no credits and no prose, and which both existing Templates make look like a failed download.
- **Five or six bundled OFL faces**, Latin subsets only, distinct voices. Noto stays the universal
  fallback including CJK. `--font-print` becomes per-Template.
  - **As built: five**, plus Noto Sans and Noto Sans JP, which is six faces a Template can name. Latin
    and Latin-ext only, roman only, one `wght` axis each — 280,420 bytes across the five.

### Fit versus taste

Measurements describe the collector's hardware and are set once; design describes one record.

- **App settings**: Label size, notch, Page width, Page count default.
  - **The Page count default was not built, on purpose** (ticket 08). Every field in `Measurements`
    is a length in millimetres, which is what the name is for, and a count is not one. The derived
    count already is the default and a better one, being about the record in front of the collector
    rather than about their preferences; the *override* lives on the Design, where it cannot carry
    forward onto a record whose content is different.
- **Per Design, carried forward from the last Release touched**: Template, colours, toggles.
- This removes the v1 asymmetry where a single lookup inherited the on-screen design while a Batch and
  a by-hand Release both got defaults.

### v1 debts closed

- A pasted line with no separator is a **title**, in a Batch as well as alone. `parseBatchLines`
  currently contradicts the comment three lines above it.
- **Import is refused while a Batch runs**, and a late restore loses to a running Batch — extending
  the existing rule that an edit beats a late restore.

## Testing Decisions

The three seams stand. Nothing here needs a fourth.

- **SheetRenderer** — the Insert's fold model as data: Page rectangles at their millimetres, fold
  positions and kind (fore-edge / spine), Page count parity, the derived-count rule, the back-cover
  artwork Page. Templates assert that each draws its own tracklist Page.
- **SheetPacker** — rotation as rectangles: a turned item reports turned dimensions, nothing overlaps,
  nothing crosses the margin, two Inserts and five Labels land on one A4, and a raised margin reports
  the Insert as unplaceable rather than dropping it. That last one is a claim about the *packer*, and
  it still holds; it is no longer a claim about the app, because the Page count is capped by the paper
  before anything is packed — see the note under Sheets above.
- **MetadataAdapter** — Discogs behind the same seam, recorded fixtures, never live. A Discogs failure
  degrades a credits Page and never a lookup.
- **Migration** — a whole v1 project file opens as a queue of Inserts with its toggles collapsed, its
  J-Card measurements read as the Insert's first four and its per-Release Label read as the project's;
  and a version-2 file is refused by a version-1 reader. **Not "to a 2-Page Insert"**: no `pageCount`
  is read from a version-1 file, so the count is derived from the content — and the content has two
  independent ways to ask for four Pages. Credits are one, which only a 1.1 file can carry; a
  tracklist too long for one Page on a Template with a back cover is the other, and a 1.0 file
  reaches four Pages that way with no credits anywhere near it. The version decides exactly one
  thing: whether an omitted `insetArtwork` means the v1.0 inset square.
- The attribution suite grows with every bundled face.

## Out of Scope

**Case stickers — struck, not deferred.** The Label is the cartridge sticker and that is the whole of
it; the v1 backlog line described something that was never wanted.

**Bleed allowance / overprint.** Considered and declined: the artwork edge stays the cut line. A
mis-cut shows a white sliver, and that is accepted.

Also out: font upload (licensing, and a project file that would not reproduce its own design);
unfielded free-text search; a Discogs API key; bridging the Insert into the case's back slot; sheet
orientation; and everything v1 already excluded — vector PDF, Hi-MD, UI internationalisation, any
backend.

## Sequence

**1.1** — 01 debts · 02 typefaces · 03 Classic and the tracklist Page · 04 Minimal · 05 Discogs.

**2.0** — 06 fit/taste split · 07 packer rotation · 08 the Insert · 09 migration and documents.

**Ticket 08 is gated on paper.** No Insert renderer code before a printed strip has been cut and
folded and the three questions in ADR-0012 answered. `.scratch/minicovered-v2/test-strip-a4.svg` is that
strip, true size, with a 100 mm calibration bar.

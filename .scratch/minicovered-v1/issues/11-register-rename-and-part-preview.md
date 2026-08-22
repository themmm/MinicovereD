# Ticket 11 — The Register, the rename, and the Part as the design surface

Design and naming are decided; **no code has been written for any of it**. This ticket is the handoff so the
implementation does not have to rediscover what was already measured.

Read first: **ADR-0008** (amended — the register made concrete, the sub-brand resolution, the Wordmark placement rule),
**ADR-0009** (the name), **ADR-0010** (the Part is the design surface). Evidence:
`.scratch/research/preview-composition.md` (peer survey, imposition practice) and
`.scratch/research/modern-retro-register.md` (the register survey). Working prototype source:
`.scratch/prototypes/register-v1/` — `node build10.mjs` inlines the fonts from `node_modules` and emits a
self-contained page; `contrast.mjs` reproduces every contrast figure quoted below.

---
## Step 0 — the rename

`mdcovergen` → **MinicovereD** canonical, `minicovered` technical (ADR-0009: both forms are correct, neither is a typo).

> **Every count in this ticket is an "as of" measurement, taken around commit `fe24fe0`. Re-measure before acting.**
> Between two readings while this ticket was being written the total went from 41 files / 80 occurrences to 46 / 101,
> because each new module adds another `throw new Error('mdcovergen: …')`. Treat the numbers as a shape, never as a
> checklist.

At the baseline the string appeared in **41 files / 80 occurrences**. Under the rule that ADRs 0001–0009 and the
`.scratch` records stay as dated protocols, **30 files / 62 occurrences** had to change — 23 under `src/`, 6 at the root,
plus `assets/logo.svg`. ADR-0009's own "roughly eighteen files" is wrong and should be corrected to whatever the figure
is on the day the rename is made.

Four items that a naive find-and-replace of the bare word will miss:

- `MDCOVERGEN_BASE` → `MINICOVERED_BASE` — `vite.config.ts` (5 places including the comment), `README.md` (2)
- the default export filename `mdcovergen.pdf` in `src/app/sheet-preview.ts` — a filename the user sees
- ~20 `throw new Error('mdcovergen: …')` prefixes spread across `src/` — the bulk of the 62
- `src/attribution/licenses/PD-textlogo.txt` (2) — the project name inside a licence note

The `client=` identifier from ADR-0006 becomes `client=minicovered-0.1.0`. npm is not a constraint (the package is
`private`). Two decisions still open: whether `.scratch/minicovered-v1/` is renamed (it is an active working directory,
linked twice from the README — unlike the ADRs, so probably yes) and the GitHub repository name (which redirects after).

The README must document both forms explicitly — that is ADR-0009's requirement, and it is the whole mitigation for
overriding criterion 12.

---
## Step 1 — the token contract

Everforest Light, and the palette imposes the rules (ADR-0008). The migration is a rewrite of `:root` in
`src/styles/app.css`, not a second block beside it. Eleven names, plus the hardcoded hexes that have to come with them —
the prototype's substitution list, which is the diff:

| today | becomes |
|---|---|
| `.shell-header__tagline { color: #94a3b8 }` | `var(--shell-faint)` |
| `.button--onshell { border-color: #33415580 }` | `var(--shell-line)` |
| `.status-pill { border: … #33415580; color: #94a3b8 }` | `var(--shell-line)` / `var(--shell-faint)` |
| `.status-pill[data-state='ready']` — `#14532d`, `#052e16`, `#86efac` | `var(--ok)`, `var(--ok-soft)` |
| `.button--primary { background: var(--shell); color: #ffffff }` | `var(--primary)` / `var(--primary-ink)` — ink-filled |
| `.button--primary:hover { background: #24374a }` | `var(--primary-hover)` |
| `.field__input { background: var(--surface); border: … var(--line) }` | `var(--sunken)` / `var(--line-strong)` |
| `.about::backdrop { background: #0f172acc }` | `#000000b3` |
| `--surface-sunken` | `--sunken` (one name, one meaning) |
| `.preview__frame { background: var(--surface-sunken) }` | **literal mount** `#3c3c3c` |
| `.preview__canvas { background: #ffffff; box-shadow … #0f172a1f }` | **literal paper** + neutral shadow |

After that migration exactly **four raw hexes** remain in the stylesheet, and all four are the deliberate literals of
ADR-0008 rule 9: paper, mount, the paper's shadow, the dialog backdrop.

**Two accessibility defects the current light theme already has**, which the migration fixes rather than introduces:
`--ink-faint #94a3b8` on white is **2.56:1**, so every 12 px uppercase field label fails AA today; and paper on
`--surface-sunken` is **1.10:1**, so the edge of the Sheet is invisible against its mount. The fixed mount is 11.03:1.

Fonts — the boundary goes in the names, replacing `--font-sans` / `--font-mono`:

- `--font-chrome` — JetBrains Mono Variable, Latin + Latin-ext, roman only, 54.3 KiB. The app surface, never a Part.
- `--font-print` — the Noto stack. Must equal `PRINT_FONT_STACK` in `src/render/raster.ts`.

Delete the comment at `src/styles/fonts.css:26-27` claiming `--font-sans` is "the stack every Part and every piece of UI
renders with". It is false by construction: `raster.ts:29` duplicates the stack as a string literal, and nothing fails
when the two drift. That is the real quarantine hole — not the `body { font-family }` inheritance, which cannot reach a
canvas at all.

---
## Step 2 — the quarantine, enforced rather than observed

Four checks. The point is that a future edit fails a test rather than silently crossing the line.

1. A test reads `src/styles/fonts.css`, reads `PRINT_FONT_STACK` from `raster.ts`, and asserts they are equal.
2. A test asserts the chrome font family appears nowhere under `src/render/**`. That includes `BUNDLED_FACES` in
   `canvas-text-measurer.ts:45-53` — the print side's font manifest, which the chrome face must never join.
3. A test reads `app.css` and asserts no `var(--` occurs inside the print-surface block.
4. `raster.ts` stays the single source of the print stack; `canvas-text-measurer.ts` already imports `fontFor` from it,
   so measuring and drawing cannot disagree. Keep it that way.

---
## Step 3 — the preview rework (ADR-0010)

Structure of the page, top to bottom: header with the search field · results (expandable) · release hero with display
type · **the Parts band, sticky** · three collapsed folds (Metadata / Design / Sheet & output) · actions.

Numbers worth reusing rather than re-inventing:

```
resting scale        --mm: clamp(3.1px, 0.5vw, 6.05px)      all three Parts, one token
condensed            --mm: 3.15px      enter 48px past the sentinel, leave at 10px  (hysteresis)
condense transition  --cond 380ms      band 664px -> 386px, room below 113px -> 614px
focus (one Part)     --mm: min(clamp(5px, 1.15vw, 13.5px), calc(56vh / 79))
thumbnails in focus  --mm-thumb: 2.85px            neighbours shrink, they do not disappear
zoom transition      width/height + caption opacity, 540ms cubic-bezier(.42, .02, .24, 1)
folds and results    grid-template-rows 0fr -> 1fr, 320ms
exit focus           the Part, the background, or Escape — but never a control
pointer targets      >= 24 x 24 CSS px  (WCAG 2.2 SC 2.5.8, audited by script)
```

The hysteresis is not polish: condensing shortens the document by ~280 px, which pulls the scroll position, and a single
threshold makes the two edges chase each other.

---
## Step 4 — search: one field

Today there are two fields (`release-search.ts`) feeding a structured Lucene query
`artist:"…" AND release:"…"` (`metadata-adapter.ts:211-216`). One field is better, and the convention already exists in
this repo: **`parseBatchLines`** (`release-search.ts:27`) reads `Artist — Album` from a single string, with six tests
covering the hard cases — only a *spaced* dash or tab separates, and only the first one, so `Jean-Michel Jarre` survives
and `F♯A♯∞ — Deluxe Edition` stays one title. Reuse that rule; do not invent a second one.

Three cases, and the field should show which one it read:

| input | query |
|---|---|
| `Glen Campbell — Wichita Lineman` | `artist:"…" AND release:"…"` |
| `wichita lineman` | free text against the release index |
| a MusicBrainz MBID or URL | resolve directly, no search |

**Required code change:** `SearchQuery` only has `artist` and `album`. A bare title routed into `artist` would search the
artist index for an album title, so the type needs a third, unfielded case and `searchTerm` a branch for it.

**Results stay open after a pick.** The selected row is marked; picking again moves the marker; only Escape, the close
button or the toggle dismisses the list. The first guess is often the wrong pressing and correcting it must not cost a
second request (ADR-0006 rate limit).

---
## Step 5 — attribution (ADR-0003)

Three entries for `src/attribution/attributions.ts`. Note that this module has since grown a **completeness check** —
`Attribution.files` for anything that is not an npm package, and `OWN_ARTWORK` for files the project drew itself — so a
shipped file that is neither attributed nor claimed fails the suite. Every item below has to satisfy that, not just the
dialog:

- **JetBrains Mono** — OFL-1.1, `@fontsource-variable/jetbrains-mono` 5.3.0, "Copyright 2020 The JetBrains Mono Project
  Authors", `packageName` is enough. Note it as chrome-only. OFL text is already bundled.
- **Everforest** — MIT, `sainnhe/everforest`. A palette, not a package and not a shipped file: the hexes end up inside
  `app.css`. Decide whether that wants an attribution entry with no `files`, or a comment in the stylesheet — the
  completeness check is about files, and this has none.
- **Lucide** — ISC 1.33.0. **`ISC` is not in `PERMISSIVE_LICENSES`** and its text is not bundled; both are prerequisites,
  because `licenseTextFor` throws rather than showing an empty licence block. If the glyphs are vendored as inline SVG in
  TypeScript they are not separate files; if they land as `.svg` assets they need `files` entries.
- **`OWN_ARTWORK` currently claims `assets/logo.svg`**, which ADR-0009 records as the discarded old mark. When the Mark
  is drawn (a separate task, not this ticket), that list and the icon PNGs move with it.

---
## Defects the prototype already found

Eight, all real, all cheap to re-introduce. Six are CSS traps that look correct in review.

1. **An unregistered custom property is not animatable.** `--mm` as a plain variable made every scale change a jump cut.
   `@property --mm { syntax: '<length>'; inherits: true }` fixes it.
2. **Never declare the same transition twice down a tree.** With `transition: --mm` on the ancestor where the value
   changes *and* on the descendants that merely inherit it, the descendants start a competing animation and pin at the
   old value. The zoom did nothing at all until the second declaration was removed.
3. **`overflow: hidden` for the `0fr → 1fr` collapse belongs on the grid *item*, not the container.** On the item its
   automatic minimum size becomes 0 and the track can close; on the container the track never closes. Verified four ways
   in isolation — item works (0 closed / 164 open), container is stuck open.
4. **A sticky element's own `offsetTop` moves once it sticks**, so using it as the trip point is self-referential and can
   never latch. Watch a static 1 px sentinel placed before it.
5. **An SVG stroke centred on the viewBox edge is half-clipped.** The Label's outline ran to x=35 in a 0–35 viewBox, so
   0.15 units hung outside on every side — measured extent `x[-0.150, 35.150]`. Inset the stroke by half its width and
   let the fill reach the true edge; the diagonal moves along its own normal.
6. **`transform` on hover re-rasterises the element**, which shifts the antialiasing of every 1 px border and SVG stroke.
   It reads as flickering edges. Hover should change colour and shadow, never geometry.
7. **`display: none` on siblings removes them in one frame**, so an element that grows also *jumps* to where the missing
   siblings used to be. Shrink the siblings and animate `width`/`height` instead; then positions glide.
8. **Specificity:** `.row span` (0,1,1) beat `.use` (0,1,0) further up the sheet, so every row showed its "in use" badge.
   And `.spec:hover .spec--label` can never match, because a `.spec` has no `.spec` ancestor — that rule was dead.

**Testing note for whoever verifies this.** The headless Chromium used here **does not advance CSS transitions and does
not dispatch scroll events**, although `window.scrollY` updates. Several measurements lied because of it. Verify UI
geometry with `* { transition: none !important }` injected, treat any mid-transition reading as meaningless, and drive
scroll-dependent code by calling its handler directly.

---
## Pending glossary additions

`CONTEXT.md` has the **Wordmark** rule already. Two more terms now exist in the UI and should be defined before they
drift, but they are UI surfaces rather than domain artifacts, so the placement is a judgement call:

- **Sheet check** — the collapsed verification of how the Parts packed onto Sheets, beside Export. Not a preview.
- **Assembled / Flat** — the J-Card's two representations: as it sits in the case, and as it prints.

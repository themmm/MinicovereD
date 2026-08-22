# Ticket 12 — the Mark, and the Spine that truncates in silence

What is left of v1 after ticket 11. Two pieces of work of different kinds: one is a design decision
that has constraints but no answer yet, the other is a defect with a decision attached. Plus two
things only the repository owner can do.

> Every number here was measured on 2026-08-22 against the head of `step-3-part-preview`, with
> tickets 01–10 merged and ticket 11 sitting in four open PRs. Re-measure before acting: if a figure
> and the code disagree, the code is right and this document is stale.

---

## Part A — the Mark

**Undecided.** ADR-0008 constrains it and ADR-0009 names the project, but no figure has been chosen.
This is a design task first and an implementation task second, so it goes the way ADR-0008 and
ADR-0010 went: prototype, decide at the screen, record, then build.

### What is decided already, and is not open

- **Never a pixel font** (rule 1). If the Mark is grid-built it is one hand-authored SVG, not a
  typeface dependency.
- **Built as a coarse module grid and scaled up**, never drawn large and scaled down (rule 2). That
  is the reason a 16 px rendering holds at all.
- **Integer scaling only**, and no more than two resolutions in one surface. Never at 150 % (rule 5).
- **No skeuomorphism** (rule 3): no bevel, no CRT, no scanlines, no fake wear.
- **No solid/hollow contrast, no M/D device, no figure derived from the cassette.** This is the one
  constraint that is easy to break by accident and is the whole point of ADR-0008's sub-brand
  resolution: solid M and D with every other letter hollow *is* the MiniDisc logo's own mechanism,
  the name already spends that exposure once, and the Mark's job is to pull the identity away from
  Sony rather than sit beside it.
- **Never on a Part** (rule 8, and CONTEXT.md under *Mark*). Screen and repository only.

### Where it lands, measured

| | |
|---|---|
| `src/app/shell.ts:1` | imports `assets/logo.svg`; used at 19 × 19 in `.top__mark` **and** as the favicon |
| `README.md:3` | the same file at 96 px |
| `src/attribution/attributions.ts:74` | `OWN_ARTWORK` claims `assets/logo.svg` |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | also the old mark, also claimed in `OWN_ARTWORK`, referenced from `vite.config.ts` |

All five move together. ADR-0009 records `assets/logo.svg` as **the discarded old mark**, so what
ships today is something a decision already rejected — that is the reason this ticket exists rather
than being cosmetic.

The prototype's header carries a stand-in, not a proposal:
`M2 4h2v8H2zM5 4h2v3H5zM5 9h2v3H5zM8 4h2v8H8zM11 6h2v4h-2z` on a 16 × 16 grid with
`shape-rendering: crispEdges`. Read it as evidence that a 19 px grid mark works in that slot, and
nothing more.

### What "done" means

- The favicon is legible at 16 px, tested at 16 px rather than assumed from a large drawing.
- Every surface is an integer multiple of the grid. 192 and 512 are not multiples of 16 in the same
  way — 192 = 16 × 12 and 512 = 16 × 32, so both are clean; check whatever grid is chosen against
  both, and against 19 in the header.
- `OWN_ARTWORK` lists exactly the files that ship. The attribution completeness test fails on a PNG
  that is neither attributed nor claimed, which is the check doing its job — do not work around it.
- ADR-0011 records the decision, including what was rejected and why the grid is the size it is.

---

## Part B — the Spine truncates in silence

**This is not the ticket the prototype implies, and that matters.**

The prototype shows a red note under the J-Card reading *"Spine type is 2.4 mm — under the 7 pt Sony
recommends for a 5.5 mm edge."* That describes the Spine type **shrinking**. The renderer does not
shrink it. Measured:

- `drawSpine` (`src/render/templates/shared.ts:94`) sets `sizeMm: 2.9` as a **constant**.
- It calls `text(...)` with a max width of `panel.height - 2 * PAD - logoLength`.
- `text()` (`shared.ts:25`) delegates to `ellipsise()` (`src/render/text.ts:19`), which **truncates
  and appends an ellipsis**.

So the Spine type is always 2.9 mm, which is *above* Sony's floor, and the warning in the prototype
can never fire. What actually happens is worse and unreported: a long `artist — album` is silently
cut off. `Godspeed You! Black Emperor — F♯A♯∞` becomes `Godspeed You! Black Em…` on the one Part that
exists to be read from a shelf, and nothing on screen says so.

### The two floors, which are different numbers for different things

```
Sony, 4–7 mm edges, 7 pt   (ADR-0008 rule 6)   2.469 mm
PRINT_FLOOR_MM, 5 pt       (tracklist-layout.ts)  1.764 mm   <- the tracklist's floor, not this one
Spine default              (shared.ts:100)      2.900 mm
```

Do not reuse `PRINT_FLOOR_MM` for the Spine. It is the general "a printer can hold this" floor;
Sony's 7 pt is a legibility recommendation for a shelved edge, and they are 0.7 mm apart.

### The decision to make

Ticket 07 set the precedent for the tracklist: **flow, then shrink, then warn, and never drop
content.** The Spine cannot flow — it is one line by design (`spineLine`, so the shelf reads one
thing) — which leaves two options:

1. **Shrink toward 2.469 mm, then truncate, and warn at each step.** Consistent with the tracklist.
   Costs a shrink loop in `drawSpine` and a second warning kind.
2. **Keep 2.9 mm and warn on truncation.** Cheaper, and arguably more honest: 2.9 mm was chosen for
   shelf legibility, and shrinking to 2.469 to fit two more words trades the thing the Spine is for.

Pick one and record why. Option 2 is the smaller change and the better argument; option 1 is the
more consistent one.

### What already exists for it

- `.note--error` in `app.css` and the per-Part note slot in `part-band.ts` are built and unused.
- `WARNING_HOME` and `WARNING_SEVERITY` in `part-band.ts` each take one new line to route a kind to
  the J-Card as an error.
- `SheetWarning` in `src/render/layout.ts` is a discriminated union; adding a member is where the
  geometry stays geometry and the wording stays in the app layer.

### What "done" means

- A `SheetWarning` kind for it, produced by the renderer, mapped under the J-Card.
- A test in `sheet-renderer.test.ts` driving a spine line long enough to trigger it, asserting the
  warning rather than the pixels — the existing type-below-print-floor tests are the pattern.
- The note visible under the J-Card in the band, in `.note--error`.

---

## Part C — only the repository owner can do these

- **Merge the four stacked PRs**, in order: #11 → #12 → #13 → #14. Each targets the one before it,
  so merging #11 retargets the rest automatically.
- **Rename the GitHub repository** to `MinicovereD`. `USER_AGENT` already points at it and GitHub
  redirects either way, so the order does not matter.

Not a task, but say it to anyone updating: **step 0 renamed `PROJECT_FORMAT` and the IndexedDB store
without a migration, by decision.** Exported project files from before it no longer read, and
autosaved queues are orphaned. Export before updating.

---

## Traps, all of which cost time in ticket 11

1. **Render the prototype. Do not read it.** The first pass at ticket 11's step 3 read
   `round10.src.html`'s stylesheet, never its body, and never built the page — then reconstructed the
   structure from ADR-0010's prose. The band came out 590 px lower than the design. Build it
   (`.scratch/prototypes/register-v1/README.md`, and point the font constants at `node_modules`),
   screenshot it, measure it, and compare element by element.
2. **Source order decides rules at equal specificity, and it decided three of them wrongly.**
   `.find__input` lost its padding to `.field__input` declared later; `.band-wrap[data-condensed]
   .band` at (0,3,0) silently outranked `.band[data-focus]` at (0,2,0); `.row span` outranked a bare
   `.use`. Check the cascade, do not assume intent wins.
3. **`overflow: hidden` on a zero-height box clips painting but not scrolling.** A closed fold's
   721 px of form counted towards the document: 1715 px of content scrolled to 2672. `overflow: clip`
   does not fix it. `contain: paint` does.
4. **Colour leaks come from missing declarations, not wrong ones.** A bare `<button>` takes
   `buttontext` (black); a bare `<a>` takes the browser's link blue. Neither is in the palette and
   neither has a `color:` line to notice. `src/render/print-quarantine.test.ts` asserts the resets
   exist.
5. **No opacity on text.** ADR-0008 law 1 is binding and the prototype breaks it in 16 places across
   12 steps, every one of which fails AA — 3.21:1 down to 1.95:1. Hierarchy is size, weight, tracking
   and space. The quarantine test enforces a four-value `color:` allowlist and a four-hex budget, and
   will fail anything else.
6. **Headless does not advance transitions and dispatches no scroll events**, though `window.scrollY`
   updates. Inject `* { transition: none !important }` before measuring, and dispatch
   `new Event('scroll')` by hand to drive scroll-dependent code.
7. **Install Playwright in the scratchpad, never in the project.** A devDependency there is fine for
   the attribution walk (it reads root `dependencies`) but the browser download is not something the
   repo should carry. The cached browser is at
   `~/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`
   — pass it as `executablePath`.

## Baselines to hold

```
band top            328 px        specimens end at 971 in a 980 viewport
document height     == #app       (no phantom scroll)
rendered text       2 colours     #5c6a72 and #fdf6e3, nothing else
faces               2             JetBrains Mono chrome, Noto prose and Parts
raw hexes in CSS    4             paper, mount, its shadow, the dialog backdrop
tests               23 files / 269
```

`npm run typecheck`, `npm test`, `npm run build` after each step, and one PR per part.

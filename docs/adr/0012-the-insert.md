# The Insert: one folded piece replaces the J-Card and the Back Card

A Release has **two** Parts, not three: the **Insert** and the **Label**. The Insert is one strip of
paper carrying the Inner Flap, the Spine, the Front Panel and then as many Pages as the Release needs,
folded into a booklet that lives entirely inside the front of the case. This supersedes ADR-0005,
which specified a three-panel J-Card plus a separate Back Card.

```
 flat, printed on one side — 4 Pages at 65 mm is 282.5 × 79 mm

 │ 14  │5.5│    68     │    65    │    65    │    65    │
 ├─────┼───┼───────────┼──────────┼──────────┼──────────┤
 │inner│spi│  PAGE 1   │  PAGE 2  │  PAGE 3  │  PAGE 4  │
 │flap │ne │front panel│ tracklist│  credits │ artwork  │
 └─────┴───┴───────────┴──────────┴──────────┴──────────┘
        ╎   ╎           ╎          ┃          ╎
        J-Card folds,   fore-edge  SPINE      fore-edge
        as before
```

ADR-0005 rejected exactly this — "a full wraparound that includes the back panel (a print-shop special
whose fit in ordinary cases is unproven)" — and the spec listed "full-wraparound inserts" and
"booklets and roll-fold inserts" as out of scope. Both judgements are reversed here, but only one of
the two arrangements 0005 lumped together is adopted, and it is the one whose fit is not in question.

## The arrangement, and the thing it gives up

The Insert goes into the front cover and stops there. **The case's back slot stays empty**, and the
paper never has to bridge the hinge — which is the fit nobody has proven and the reason 0005 said no.

The cost is real and is accepted with eyes open: **a shelved case no longer shows its tracklist.**
That was the one thing the two-card arrangement did better, and losing it is the price of one piece.
The tracklist is now inside a booklet that has to be taken out and opened.

## The fold, which single-sided printing fully determines

Only one side is printed. A visible face is therefore printed only when the paper's printed side
points outward, so every face can be printed only if the paper doubles back **blank against blank**.
That makes each leaf two Pages thick, and it fixes the fold pattern completely:

| strip order | the fold to its right | what meets what |
| --- | --- | --- |
| Page 1 — the cover, and the Front Panel | fore-edge | blank meets blank |
| Page 2 | **SPINE** | printed meets printed |
| Page 3 | fore-edge | blank meets blank |
| Page 4 — the back | — | — |

Open the cover and Pages 2 and 3 face you as a spread — which is the one fold where printed meets
printed, and is why nothing blank is ever visible. The object **pages like a book, not like a fan**:
leaves hinge at the spine, and Pages run in reading order left to right along the flat strip.

Two rules fall out of this and are not negotiable. **The Page count is always even**, because a leaf
is two Pages. And **four Pages is the most one A4 sheet holds**: at 65 mm inner Pages the strip is
282.5 mm against 287 mm of usable length, with the 4.5 mm of slack noted in ADR-0014. Six Pages needs
a second strip. Inner Pages come out slightly narrower than the 68 mm Front Panel, which is what a
book cover does anyway.

## How many Pages, and what goes on one with nothing to say

The Page count is **derived from content and roundable up**, with a manual override:

- **Two Pages** — Front Panel and tracklist. The common case, and the only case a hand-made mixtape
  can reach: it has no Discogs entry (ADR-0013) and there is no free-text field, so there is nothing
  to put on a third Page.
- **Four Pages** when the tracklist overflows, or when credits exist to print.
- **The odd Page out carries the artwork again, as a back cover.** This is what a real booklet does,
  it costs nothing because the image is already embedded at full resolution, and it means the
  even-Page rule can never produce a blank sheet of paper the collector did not ask for.

## Rejected

**Bridging the hinge into the back slot** — 0005's unproven fit, and still unproven. Nothing should be
built toward it on faith.

**Keeping the Insert alongside the three v1 Parts.** Considered and overruled: two ways to make the
same object is two renderers, two sets of Templates and a choice nobody has the information to make on
first open.

**Making it a Template rather than a Part.** A Template decides how a Part *looks*; it never decides
how many panels the Part has or where it folds. CONTEXT.md's Design and Template entries were
tightened specifically to keep that line clean.

**Glue.** It would allow a codex with arbitrary Page counts and no doubling, and it asks a collector
to own glue, apply it straight, and wait. The concertina needs scissors and a fold, which is the tool
list the whole project has assumed since the calibration sheet.

**The name `Wrap`.** Used throughout the design conversation and discarded on the evidence: a wrap
wraps around something, and this arrangement explicitly does not. `Booklet` is untrue at two Pages,
which is the common case. `Leporello` is precise for a concertina and wrong for something that pages
like a book. **Insert** is accurate at two Pages or eight, and its promotion means flipping the
`_Avoid_: Insert` line on the J-Card entry that has stood since v1.

## Consequences

`PartKind` goes from three members to two. **J-Card** and **Back Card** stay in CONTEXT.md marked as
retired v1 Parts rather than being deleted, because six ADRs and the v1 spec name them and a reader who
meets "J-Card" in ADR-0005 needs the glossary to say what became of it. **Front Panel**, **Spine** and
**Inner Flap** survive untouched as sections of the Insert, and **Page** joins them — Page 1 *is* the
Front Panel.

`PROJECT_VERSION` becomes 2, and old files migrate rather than being refused: a v1 Design has exactly
one J-Card and one Back Card, which is exactly a 2-Page Insert, and the `jcard` + `back-card` toggles
collapse to one `insert` toggle. v1.0.0 is public; a second silent loss of saved work would be a
pattern rather than an accident.

The 282.5 mm strip cannot be placed on any Sheet the packer can currently build. See ADR-0014.

## Unproven, deliberately

**No renderer code should be written until a printed strip has been cut and folded**, and three
questions answered with paper: does a four-Page folded stack seat in a front cover designed for one
card; does the J-Card end still hold the Insert in place; and once the tracklist is inside a booklet,
is it missed. `.scratch/minicovered-v2/test-strip-a4.svg` is the strip, at true size, with a 100 mm bar so a
scaled print is caught first. ADR-0005's sentence about unproven fit is still true of *some*
arrangement of paper in a MiniDisc case, and this is the experiment that decides which.

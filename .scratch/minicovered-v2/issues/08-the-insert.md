# 08: The Insert (ADR-0012)

**GATED ON PAPER.** No renderer code until a printed strip has been cut and folded and three questions are answered: does a four-Page folded stack seat in a front cover designed for one card; does the J-Card end still hold it in place; and once the tracklist is inside a booklet, is it missed. `.scratch/minicovered-v2/test-strip-a4.svg` is the strip, true size, with a 100 mm bar so a scaled print is caught first.

**What to build:** `PartKind` goes from three to two — `insert` and `label`. The Insert is one strip: Inner Flap 14 + Spine 5.5 + Front Panel 68 + Pages at 65 mm, height 79, folded concertina with the printed side out.

The fold pattern is fixed by single-sided printing: Pages run in reading order along the flat strip, folds alternate fore-edge / spine / fore-edge, blank always meets blank, and the Page count is always even. Four Pages is the A4 maximum at 282.5 mm.

Page count derives from content with a manual override: two Pages normally, four when the tracklist overflows or credits exist to print. The odd Page out repeats the artwork as a back cover. A mixtape is always two Pages.

**Blocked by:** 06, 07, and the paper test.

**Status:** done

- [x] The strip has been printed, cut and folded, and the three questions answered in writing — below
- [x] Fold positions and kinds come out of the layout model as data, asserted in millimetres
      (`insertFolds`; `FoldGuide.fold`; `sheet-renderer.test.ts` asserts 14 / 19.5 / 87.5 fore-edge /
      152.5 spine / 217.5 fore-edge)
- [x] Page count is always even; a tracklist that overflows one Page produces four **where there is
      something to fill them** — see the amendment below
- [x] The odd Page out carries the artwork, not blank paper
- [x] A Release with no credits and no artwork produces exactly two Pages
- [x] Fold guides distinguish fore-edge from spine on the printed Sheet — three dash patterns in
      `raster.ts`, verified in a browser as 29 / 14 / 23 marks down the same 79 mm
- [x] Preview and PDF agree, as they must — one layout model, two readers

## The paper test, answered

The strip was printed at 100 % — the 100 mm bar measured 100 mm — cut, and folded: the two dashed
fore-edges away from the printed side, the solid centre line toward it.

**Does a four-Page folded stack seat in a front cover designed for one card?** Yes. Four Pages fold
to a stack the front cover takes without forcing.

**Does the J-Card end still hold the Insert in place?** Yes. The Inner Flap folded inside grips as it
did on a single card.

**Once the tracklist is inside a booklet, is it missed?** No — and this is the answer that mattered
most, because it is the one ADR-0012 accepted as a cost rather than expected to win. One piece is the
better object in the hand. Losing the shelf-readable list is a price worth paying rather than merely
an accepted one.

So ADR-0005's judgement is reversed on measurement rather than on hope, and ADR-0012's
"Unproven, deliberately" became "Proven, on paper".

**The paper also settled ticket 07's millimetre.** ADR-0014's one-Sheet picture was false by 1 mm at
the gap the app shipped, and 07 left four ways out. `DEFAULT_PART_GAP_MM` went from 4 to 3.5: of the
four numbers in that sum it is the only one that is not a measurement of physical hardware.

## Amendments to this ticket, found while building it

**"A tracklist that overflows two Pages produces four" is conditional.** It produces four when there
is something to fill the fourth Page — credits, or a back cover. A mixtape has neither, and
ADR-0012's own reason ("there is nothing to put on a third Page") is what makes that fall out rather
than being a special case. Three Pages of tracklist is not a better object than one Page of small
type, and the small type already reports itself.

**Letter can never print a four-Page Insert.** 282.5 mm of strip against a 279.4 mm long edge: over
by 3.1 mm at every printable margin including zero. ADR-0014 checked A4's 287 and never checked the
other paper this app offers. The Page count is therefore capped by the paper, and a Letter job is
told which Page it lost and why.

**The calibration sheet cannot draw the Insert whole**, so it draws the case end (87.5 × 79, both
folds marked) and one Page (65 × 79), with the strip's own lengths printed as numbers. Those are what
a collector holds a case and a cartridge against.

**`PartKind`'s collapse and the project-file migration were both done here**, not left to 09 — you
cannot render an Insert without a `PartKind` for it, and `readDimensions` could not compile without
reading the new shape. What is left for 09 is the documents and one end-to-end round trip.

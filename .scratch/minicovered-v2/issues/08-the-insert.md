# 08: The Insert (ADR-0012)

**GATED ON PAPER.** No renderer code until a printed strip has been cut and folded and three questions are answered: does a four-Page folded stack seat in a front cover designed for one card; does the J-Card end still hold it in place; and once the tracklist is inside a booklet, is it missed. `.scratch/minicovered-v2/test-strip-a4.svg` is the strip, true size, with a 100 mm bar so a scaled print is caught first.

**What to build:** `PartKind` goes from three to two — `insert` and `label`. The Insert is one strip: Inner Flap 14 + Spine 5.5 + Front Panel 68 + Pages at 65 mm, height 79, folded concertina with the printed side out.

The fold pattern is fixed by single-sided printing: Pages run in reading order along the flat strip, folds alternate fore-edge / spine / fore-edge, blank always meets blank, and the Page count is always even. Four Pages is the A4 maximum at 282.5 mm.

Page count derives from content with a manual override: two Pages normally, four when the tracklist overflows or credits exist to print. The odd Page out repeats the artwork as a back cover. A mixtape is always two Pages.

**Blocked by:** 06, 07, and the paper test.

**Status:** blocked

- [ ] The strip has been printed, cut and folded, and the three questions answered in writing
- [ ] Fold positions and kinds come out of the layout model as data, asserted in millimetres
- [ ] Page count is always even; a tracklist that overflows two Pages produces four
- [ ] The odd Page out carries the artwork, not blank paper
- [ ] A Release with no credits and no artwork produces exactly two Pages
- [ ] Fold guides distinguish fore-edge from spine on the printed Sheet
- [ ] Preview and PDF agree, as they must — one layout model, two readers

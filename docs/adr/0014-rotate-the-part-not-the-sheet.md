# The Part turns, not the Sheet

`SheetPacker` learns to place an item rotated 90°. **Sheet orientation is not added** — there is no
Portrait/Landscape control, no per-Sheet orientation field, and A4 and Letter keep the dimensions they
have always had.

## The problem

ADR-0012's four-Page Insert is **282.5 × 79 mm**. A Sheet is A4 at 210 × 297 with a 5 mm printable
margin, which is 200 × 287 of usable area, and `PaperSize` has no orientation concept at all — A4 is
literally `{ width: 210, height: 297 }`. The packer shelf-packs `PackItem<T>` as given and has no
notion of turning anything. So the Insert is 82.5 mm too wide for the paper and unplaceable by any
means the app currently has.

## The arithmetic that decides it

Stood on end, the Insert is 79 × 282.5 inside 200 × 287. It fits, and it fits well:

| | mm |
| --- | --- |
| usable area, A4 portrait at 5 mm margin | 200 × 287 |
| one Insert, turned | 79 × 282.5 |
| two Inserts side by side | 158 of 200 |
| the column that leaves | 42 × 287 — five Labels |

Turning the *sheet* instead buys nothing: A4 landscape is 287 × 200, the same 287 in the long
direction, so the Insert fits exactly as well and every other Part now sits on a page with a different
shape. Orientation would be a setting that changes everything and solves nothing.

Two corrections to that table, both found by running the packer in ticket 07 rather than by deriving
them again.

**It assumes no gap between the pieces, and the app packs with one.** `DEFAULT_PART_GAP_MM` is 4 mm.
Two turned Inserts and one column of Labels need 79 + 79 + 35 = 193 mm of width plus two gaps, against
200 mm of printable width, so the picture holds up to a 3.5 mm gap and no further — at 4 mm the Labels
are pushed onto a second Sheet by one millimetre. Nothing was changed for it: there is no Insert yet,
so moving the gap would have changed how v1's three Parts pack for the sake of a Part that does not
exist. Ticket 08 has the choice, and a printed strip to settle it against — a 3.5 mm gap, a 4.5 mm
printable margin, or a millimetre off the strip.

**Turning alone does not draw the picture either.** Shelf packing puts every rectangle on a shelf at
that shelf's own top edge, so the 42 mm strip beside two turned Inserts can only ever hold the one
Label at the top of it, whatever the gap. `SheetPacker` gained a second thing in ticket 07 for this:
the room under a placed rectangle may hold a column of shorter ones. It is off by default, on for
Parts, and off for the calibration sheet, which wants its figures in reading order.

## What it costs, and what it saves

Saved: no new Sheet setting, no second calibration sheet, no Letter-specific special case, no
orientation field in the project file, and A4 and Letter keep behaving identically. A future reader
asking where the landscape option went can be told it was never needed.

Cost, and it is a sharp one: **282.5 against 287 is 4.5 mm of slack.** A collector who raises the
printable margin above 7.25 mm loses the four-Page Insert entirely. The app must say so — a Part that
cannot be placed is already reported by the packer, and this is the case that will actually happen,
because 5 mm is a default that home printers routinely need raised.

Rotation goes into `SheetPacker`, which the spec names as one of the three testing seams and which is
already generic over `PackItem<T>`, so it is tested as rectangles rather than as pixels: nothing
overlaps, nothing crosses the margin, a turned item's placement reports its turned dimensions. The
renderer needs nothing new — draw ops already carry `rotationDeg`, which is how the Spine reads
bottom-to-top today.

That last sentence was half right, and ticket 07 found the other half. `rotationDeg` turns one op on
the spot — text about its anchor, an image about the centre of its rect; there was no whole-Part turn
anywhere, and `PartPlacement` had no field to say
that one had happened. It gained `turned`, and `raster.ts` gained one rotation immediately after the
translate to the Part's box — which turns the drawing, the cut-outline clip and the guides together,
because all three are already drawn under that one transform. The PDF path really did need nothing: it
takes rasterised PNGs. Neither did any Template, which is the point.

## Rejected

**A Portrait/Landscape control.** Solves the same problem with a permanent setting, and multiplies
every geometry test by two.

**Auto-selecting sheet orientation.** The same feature with the setting hidden, which is worse: the
paper silently changes shape depending on what is queued.

**Making the Insert narrower so it fits unturned.** 200 mm of usable width against 19.5 mm of Inner
Flap and Spine leaves 180 for Pages — 45 mm each at four Pages, two-thirds of the Front Panel's width.
The booklet would be reshaped by the paper rather than by the case.

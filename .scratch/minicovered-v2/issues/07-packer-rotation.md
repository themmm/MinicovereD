# 07: SheetPacker turns a Part (ADR-0014)

**What to build:** `SheetPacker` places an item rotated 90°. No Sheet orientation is added — `PaperSize` keeps its dimensions and A4 and Letter keep behaving identically.

The four-Page Insert is 282.5 × 79 mm against 200 × 287 usable. Turned, two Inserts use 158 of 200 mm and leave a 42 mm column for five Labels. The renderer already knows how to rotate: draw ops carry `rotationDeg`, which is how the Spine reads bottom-to-top.

The slack is 4.5 mm. A printable margin above 7.25 mm makes the four-Page Insert unplaceable, and that must be reported, not silently dropped.

**Blocked by:** nothing, but only useful with 08.

**Status:** ready-for-agent

- [ ] A turned item reports turned dimensions in its placement
- [ ] Nothing overlaps and nothing crosses the printable margin, turned or not
- [ ] Two Inserts and five Labels land on one A4 portrait Sheet
- [ ] A 10 mm margin reports the four-Page Insert as unplaceable, with a message naming the margin
- [ ] The calibration sheet, which uses the same packer for outlines that are not Parts, is unaffected

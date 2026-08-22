# 02: Tracer bullet — manual Release to printable PDF

**What to build:** The complete core path: enter a Release by hand (artist, album, year, free text, tracklist, artwork upload), render all three Parts with the Classic template — J-Card unfolded (Front 68 + Spine 5.5 + Inner Flap 14, height 79), Back Card 69×79, Label per default preset — placed on one A4 Sheet with cutting and fold guides, with live preview, exported as an exact-mm 300 DPI PDF. This establishes the SheetRenderer seam (ADR-0005, CONTEXT.md vocabulary).

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] A manually entered Release with uploaded image renders all three Parts at the physical defaults
- [ ] The default Sheet contains all three Parts on one A4 page with cutting guides on every Part and fold guides on the J-Card
- [ ] The exported PDF parses back as A4 in mm; Part bounding boxes within ±0.2 mm of the defaults
- [ ] The raster is 300 DPI (a 100 mm span equals the 300-DPI-implied pixel count)
- [ ] Live preview matches the exported layout
- [ ] Geometry tests at the SheetRenderer seam (layout model assertions) are green

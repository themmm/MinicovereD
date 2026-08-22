# 03: Sheet packing & sheet configuration

**What to build:** The SheetPacker seam: paper size A4 (default) and Letter, configurable printable margin (default 5 mm), per-job Part toggles (e.g. Labels only), and bin-packing of multiple Releases' Parts onto as few Sheets as possible.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] A queue of several Releases packs onto the minimal number of Sheets with no overlaps and nothing inside the printable margin
- [ ] The "Labels only" toggle produces Sheets containing only Labels
- [ ] Letter yields the correct page size in the exported PDF
- [ ] Packing tests at the SheetPacker seam are green (fixed rectangle sets: expected sheet counts, overlaps, margins, single-Release-one-sheet)

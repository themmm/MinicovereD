# Spec: mdcovergen v1

## Problem Statement

A MiniDisc collector wants to print cover inlays for MD cases and stickers for the cartridges themselves. The web tool they started with is outdated, requires tedious manual entry of artist, album, and tracklists, and now charges money. The free alternatives each cover only one piece: one generates only the cartridge label (fixed 38×54 mm layout, PNG only, no sheets), another only cover + spine (non-commercial license, no disc label). No free tool produces the complete set — J-Card, Back Card, and Label — as print-accurate, cut-ready sheets, and none fetches release metadata, so every tracklist is typed by hand. Browser-based printing also scales unpredictably, so cut-out parts miss the case by millimetres.

## Solution

mdcovergen is a fully client-side, installable web app (PWA) that turns a Release — fetched from MusicBrainz/Cover Art Archive or entered by hand — into a print-accurate PDF sheet containing all three Parts (J-Card, Back Card, Label) with cutting and fold guides, at exact millimetre size and 300 DPI. Multiple Releases are bin-packed onto as few A4/Letter sheets as possible. A calibration sheet lets the user verify their printer with scissors and a ruler. Everything persists locally; no account, no server.

## User Stories

1. As a collector, I want to search releases by artist/album, so that I don't type metadata by hand.
2. As a collector, I want the tracklist with track numbers fetched automatically, so that the Back Card is complete without typing.
3. As a collector, I want cover art fetched automatically, so that the Front Panel shows the album artwork.
4. As a collector, I want to override every fetched field, so that database errors don't end up on paper.
5. As a collector, I want to create a Release fully manually, so that mixtapes and personal recordings get covers too.
6. As a collector, I want to upload my own image as artwork, so that manual Releases are not text-only.
7. As a collector, I want to add several Releases to a print queue, so that I can produce many covers in one session.
8. As a collector, I want to review and edit each resolved Release before printing, so that mistakes are caught on screen, not on paper.
9. As a collector, I want a failed lookup to be flagged for manual completion instead of aborting the whole batch, so that one missing album doesn't block ten others.
10. As a collector, I want to see fetch progress while a batch resolves, so that throttled metadata fetching doesn't look hung.
11. As a collector, I want to choose a Template per Release, so that different albums can have different looks.
12. As a collector, I want to adjust colors per Release, so that the design matches the artwork's mood.
13. As a collector, I want to show or hide text over the cover, so that full-bleed artwork can stay clean.
14. As a collector, I want the MiniDisc logo toggleable on Front Panel and Spine, so that I can match the original-insert look or omit it.
15. As a collector, I want a live preview of every Part, so that I see the result before exporting.
16. As a collector, I want the J-Card previewed unfolded with fold guides, so that I understand what I'm cutting and folding.
17. As a collector, I want to choose between Label presets (Classic and Full), so that the sticker matches my sticker paper and taste.
18. As a collector, I want to fine-tune the Label size, so that it fits the exact recess of my cartridges.
19. As a collector, I want the diagonal corner notch optional on the Label, so that the shape matches my cases.
20. As a collector, I want long tracklists to flow into two columns and then shrink automatically, so that no track is lost on the Back Card.
21. As a collector, I want all three Parts of one Release on one A4 sheet by default, so that one cover means one cut-out page.
22. As a collector, I want multiple Releases packed onto as few sheets as possible, so that batch printing wastes no paper.
23. As a collector, I want to choose which Parts go onto sheets (e.g. Labels only), so that I can reprint just stickers.
24. As a collector, I want A4 and Letter paper sizes, so that my printer's stock works.
25. As a collector, I want a configurable printable margin, so that home printers never clip content.
26. As a collector, I want cutting guides on every Part and fold guides on the J-Card, so that cutting with scissors is precise.
27. As a collector, I want the exported PDF to be exact-size in millimetres, so that cut-out Parts physically fit case and cartridge.
28. As a collector, I want 300 DPI output, so that text and artwork print at professional quality.
29. As a collector, I want a calibration sheet with a 100 mm test square and all preset outlines, so that I can verify my printer scales correctly.
30. As a collector, I want my work autosaved, so that a browser restart loses nothing.
31. As a collector, I want to export and import a project file, so that designs move between devices and survive as backups.
32. As a non-technical user, I want to install the tool as a local app on Windows, macOS, and Linux from a hosted page, so that there is nothing to set up.
33. As a user, I want the app to keep working offline after the first visit, so that I can design without internet.
34. As a user, I want no account and no login, so that the tool is mine.
35. As a collector, I want to enter titles with umlauts, accents, or Japanese characters and see them rendered correctly on paper, so that my whole library is coverable.
36. As a collector, I want fonts bundled with the app, so that offline use keeps the typography.
37. As a collector, I want the spine to carry artist, album, and logo readable when the case is shelved, so that the shelf looks right.
38. As a collector, I want to reorder and remove Releases in the queue, so that the batch reflects what I actually print.
39. As a user, I want visible attribution for bundled fonts and libraries, so that licenses are honored.
40. As a collector, I want an empty state that walks me to my first Release, so that the tool is obvious on first open.

## Implementation Decisions

- **Architecture**: fully client-side, no backend, no accounts (ADR-0001). Distributed as a statically hosted, installable, offline-capable PWA; the same build additionally ships as a single-file HTML download (ADR-0002).
- **Dependencies**: FOSS-only under permissive licenses; visible attribution (ADR-0003). The official MiniDisc logo is bundled as an optional asset, trademark risk consciously accepted (ADR-0004).
- **Insert format**: three-panel J-Card (Front Panel 68 mm + Spine 5.5 mm + Inner Flap 14 mm, height 79 mm) plus a separate Back Card (default 69 × 79 mm) carrying the tracklist (ADR-0005). All Part dimensions are adjustable parameters with these defaults.
- **Label**: presets Classic (≈35 × 52.5 mm, diagonal notch on) and Full (38 × 54 mm, notch off); size adjustable; notch optional.
- **Stack**: TypeScript + Vite, no heavyweight UI framework. Bundled OFL fonts with broad glyph coverage including CJK (unicode-range subsets), system fallback for missing glyphs. UI language English; all text handling Unicode-safe.
- **Core modules at the testing seams**:
  - *SheetRenderer*: pure function from (Release, Template + parameters, Sheet config) to a layout model plus a 300 DPI raster and a PDF with exact mm page and part placement. Owns Templates, J-Card unfolding, fold/cutting guides, tracklist overflow (two columns, then font shrink), logo and text toggles.
  - *SheetPacker*: pure function from (Parts with dimensions, paper size, printable margin) to Sheet placements; bin-packs Parts of multiple Releases onto minimal sheets; single Release defaults to one sheet with all three Parts.
  - *MetadataAdapter*: MusicBrainz release search + release/tracklist fetch + Cover Art Archive artwork, normalized into the Release domain type; 1 request/second throttled queue with progress and per-item failure; identifying User-Agent per MusicBrainz policy. No API key required.
- **PDF export**: rasterized at 300 DPI and embedded at exact mm via a FOSS PDF library; cutting guides on every Part, fold guides on the J-Card.
- **Sheets**: A4 default, Letter option; printable margin configurable, default 5 mm; per-job Part toggles (e.g. Labels only).
- **Calibration sheet**: 100 mm test square plus outlines of every preset at 1:1, on one sheet.
- **Persistence**: autosave to IndexedDB; project file export/import as a single JSON with embedded images.
- **Templates v1**: Classic (solid background, clear typography, logo) and Full-bleed (artwork across the Front Panel, text as overlay). Parameters shared: colors, text visibility, logo visibility.

## Testing Decisions

A good test exercises external behaviour at a seam — geometry and bytes — never implementation details. The three seams (SheetRenderer, SheetPacker, MetadataAdapter) are pure or fixture-driven and carry the test suite; UI flows are verified manually per ticket demo step, no E2E suite in v1.

- **SheetRenderer**: SheetRenderer also returns its layout model (placements in mm) alongside the raster/PDF, so tests assert geometry as data: Part bounding boxes equal the physical defaults within tolerance; fold and cutting guide positions correct; tracklist overflow produces two columns then smaller type without dropping tracks; Unicode strings pass through without replacement characters. Raster-level tests are limited to calibration: rendered 100 mm span equals the pixel count implied by 300 DPI, and the PDF's page size parses back to the paper size in mm.
- **SheetPacker**: fixed rectangle sets produce the expected sheet count; no two placements overlap; nothing intersects the printable margin; a single Release yields exactly one sheet containing all three Parts; Part toggles remove Parts from sheets.
- **MetadataAdapter**: recorded HTTP fixtures (search hit, search miss, release with tracklist, artwork) — never the live network; normalized Release fields match the fixtures; a failing item is reported per-item while the rest of the queue resolves; the throttle processes the queue completely.

## Out of Scope

Discogs or other metadata providers and user-supplied API keys (v2); user font upload (v2); a Minimal/typographic third template (v2); full-wraparound inserts; two-card layouts with duplicated spines; case-back stickers; vector PDF output; UI internationalization; Hi-MD and full-size MD cases; booklets and roll-fold inserts; any backend, account, or cloud sync; direct printer integration.

## Further Notes

- Dimension sources: Wikipedia (cartridge 68 × 72 × 5 mm); atriptych/Minidisc-Label-Template SVG measured directly (J-Card panels 68 / 5.5 / 14 × 79 mm, back panel ≈69 × 79 mm); Sony blank-label template ≈35.75 × 52.75 mm and measured originals ≈34.5 × 52.5 mm; jkap generator canvas 38 × 54 mm. Sources disagree slightly; adjustable sizes plus the calibration sheet absorb the variance.
- No existing free tool covers all three Parts at once (jkap: label only; RunePML: cover + spine only, CC BY-NC-ND; atriptych: static templates). That gap is the product.
- The attribution dialog doubles as the license-compliance surface required by ADR-0003.
- v2 backlog, and what became of each: **Discogs** shipped (ADR-0013) and **API keys did not** — a
  read needs none. **Font upload** declined: licensing, and a project file that could not reproduce its
  own design. **Minimal template** shipped. **Case stickers struck, not deferred** — the Label is the
  cartridge sticker and that is the whole of it, and this line described something that was never
  wanted.

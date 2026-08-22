# 02: Bundled typefaces, and a print stack per Template

**What to build:** Five or six OFL faces with genuinely different voices — a serif, a slab, a grotesque, a condensed, a humanist — Latin subsets only, bundled into both builds. Noto Sans stays the universal fallback, including the CJK face. `--font-print` stops being one global stack and becomes the Template's choice.

The size budget is real: the single-file build is 2.55 MB today, roughly 1 MB of which is Noto Sans JP, and every face inlines into that double-clickable HTML. Latin-subset-only faces should land the artifact near 3.5 MB.

`PRINT_FONT_STACK` in `src/render/raster.ts` must stay byte-identical to what CSS declares, because a canvas cannot read a custom property and a test enforces it. That test grows to cover one stack per Template.

**Blocked by:** nothing.

**Status:** ready-for-agent

- [ ] Five or six faces bundled, each attributed in the about dialog and passing the attribution suite
- [ ] Both builds carry the same faces — no PWA-only set (ADR-0002)
- [ ] The single-file artifact stays under 4 MB
- [ ] A Template selects a face; preview and PDF agree, verified through the injected measurer
- [ ] The CSS/`PRINT_FONT_STACK` equality test covers every Template's stack

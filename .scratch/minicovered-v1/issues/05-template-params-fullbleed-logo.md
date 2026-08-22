# 05: Template parameters, Full-bleed template, logo

**What to build:** The per-Release parameter system (colors, text visibility, logo visibility) applied across templates; the Full-bleed template (artwork across the Front Panel, text as overlay); the bundled official MiniDisc logo (ADR-0004) placed on Front Panel and Spine, toggleable.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Each Release independently selects Classic or Full-bleed
- [ ] Color, text-visibility, and logo parameters change the rendered output in preview and PDF
- [ ] The logo appears on Front Panel and Spine when enabled and is absent when disabled
- [ ] Spine text (artist, album) is oriented to read correctly when the case is shelved

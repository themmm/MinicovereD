# Register prototype — throwaway, kept as the primary source

The page the register and preview decisions were actually made at. **Not production code**: written under prototype
rules (no tests, no error handling, CSS rewritten from scratch rather than migrated). The decisions it settled are
recorded in ADR-0008, ADR-0010 and ticket 11; this directory only exists so the reasoning can be re-seen rather than
re-argued.

## Build and open

```sh
node build10.mjs        # inlines the woff2 faces as data URIs -> round10.html
open round10.html       # one self-contained file, no network
```

`build10.mjs` reads Noto Sans from `node_modules/@fontsource-variable/noto-sans` and the mono candidates from a
scratch directory that no longer exists — point the `F` constant at `npm pack @fontsource-variable/jetbrains-mono`
output, or drop the candidates you do not need. It also inlines `assets/minidisc-logo.svg`, the real bundled asset from
ADR-0004, so the Spine shows the actual mark rather than a stand-in.

## What to look at

- `←` `→` nothing; the layout question is settled (variant B, editorial). The bottom bar switches **font** and
  **palette** — the palette switcher is a robustness test, not an open question.
- Click a Part to isolate it; click the background or press `Esc` to return.
- `j` toggles the J-Card between assembled and flat.
- Scroll down: the Parts condense in one transition so the folds below have room.

## Files

- `round10.src.html` — the page, with `/*FACES*/` where the fonts get inlined
- `build10.mjs` — the inliner
- `palettes.js` — all ten palette variants mapped onto the token contract, every hex from a primary source
  (`@catppuccin/palette`, `@rose-pine/palette`, `nord`, `sainnhe/everforest`, `rebelot/kanagawa.nvim`,
  `tokyo-night-vscode-theme`)
- `contrast.mjs` — `node contrast.mjs` reproduces the contrast table that decided the palette, including the finding
  that every light variant fails 4–7 of the eleven pairs while every dark one fails 0–2

## The comparison this replaced

An earlier round compared six palettes and four monospace faces against the *real* `src/styles/app.css`, driven through
a substitution list — so what was on screen was the proposed end state, not a mockup. That substitution list survives as
the migration table in ticket 11, which is the part worth keeping.

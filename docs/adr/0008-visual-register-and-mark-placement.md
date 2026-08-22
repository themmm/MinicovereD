# Visual register: grid in the Mark, contemporary everywhere else

The Register is **grid geometry in exactly one layer — the Mark — with contemporary technique everywhere else**. The app surface is terminal-flavoured: monospace typography and one named, permissively licensed 16-colour palette, with smooth vector iconography. "Oldschool" here means module grids and a colour contract; it never means reproducing a historical interface. The Mark lives in the app icon, the favicon, the README and the about dialog, and **never on a printed Part**. Templates stay neutral.

The one-layer rule is the whole decision, and both reference points arrived at it independently from opposite directions. Omarchy puts the grid in the mark: its `logo.svg` is a vector on a raster — 81 × 19 cells of 15 units, path commands `m h v l z` only, not a single curve — and its favicon is two colours with no anti-aliasing on a 15 × 15 module grid, which is why it survives at 16 px. Everything else is contemporary: eleven of its twelve site icons are smooth béziers, its type is JetBrains Mono (OFL), its palette is Tokyo Night, and its manual is a plain white sans-serif book with no terminal styling at all. Modern pixel-art games do the inverse — grid in the content, and **eleven of fifteen surveyed titles use a smooth vector or hand-lettered wordmark**. Pedro Medeiros of Celeste names the principle: "the trick here is the quarantine; styles never leak from one world to another." The practitioner term for the category is *hi-bit* (Jo-Remi Madsen, D-Pad Studio); "neo-retro" has no primary definition.

The games' placement is unavailable here. Their grid sits in the content, and this project's content layer is the printed Part, which belongs to the user's shelf rather than to the tool. Omarchy's placement is therefore the only one left.

Keeping the Mark off the Part is also forced by measurement, not only by manners. At 300 DPI the 5.5 mm Spine is 65 device pixels; a 16 × 16 Mark at the minimum crisp integer scale of 4× is 5.42 mm and fills the Spine entirely, leaving no margin — and the Spine already carries artist, album and the Logo, whose own small-size artwork version Sony specifies for the 4–7 mm range. Sony DADC's artwork specification is explicit anyway: "Never combine the 'MiniDisc' logo with other characters, figures or logos. Always display it independently." A hidden signature on the Inner Flap, which folds inside the case and is invisible when shelved, remains the only acceptable variant if a printed signature is ever wanted; it is not part of v1.

Rules that follow:

1. **The Wordmark is never set in a pixel font.** That is the pastiche move; the four surveyed titles that do use pixel lettering build their letters out of the game's own substance rather than applying a typeface. If the Mark is grid-built, it is drawn specifically — one hand-authored SVG, not a font dependency.
2. **The favicon is built as a coarse module grid and scaled up**, never drawn large and scaled down. Grid construction is why a 16 px rendering holds.
3. **No skeuomorphism**: no bevelled chrome, no CRT filter, no scanline overlay, no fake wear, no plastic-button shading.
4. **No period-reproduction UI kits** — 98.css, NES.css, system.css, XP.css, 7.css, PSone.css. All are MIT and all reproduce, which is the thing being rejected; NES.css at 21.8k stars and 98.css at 11.5k are also why those registers read as templates.
5. **Integer scaling only** for grid artwork, and no more than two resolutions in one surface. Never at 150%.
6. **Pixel type never for body copy or tracklists.** One device pixel at 300 DPI is 0.0847 mm, below Sony's documented 0.15 mm minimum stroke width, and its 5 pt minimum character size needs an 8 px-em face at 3× or more. Body text stays an outline face; the repository already ships Noto Sans Variable and Noto Sans JP.
7. **Licences are checked before adoption** (ADR-0003). Known traps that fail: VileR's Oldschool PC Font Pack and PxPlus IBM VGA8 (CC BY-SA), Grand9K Pixel (CC BY-SA), m6x11 and m3x6 (no SPDX licence), ChicagoFLF (contradictory terms). Trademarked and unusable: Chicago, Monaco and New York (Apple), SST (Sony). Verified clean: JetBrains Mono, Departure Mono, Silkscreen and Ark Pixel (OFL), Pixel Operator, m5x7 and monogram (CC0), Cozette (MIT). Palette collections Catppuccin, Tokyo Night, Nord, Rosé Pine, Everforest and Kanagawa are MIT; Gruvbox declares MIT in its README but ships no licence file.

8. **The Wordmark never goes on a Part either.** Rule for the Mark, now extended: Sony DADC requires the Logo to be
   "display[ed] independently", the Spine already carries it, and ADR-0009 records that the name reads as a Sony sub-brand.
   A sub-brand-shaped name beside the real Logo on a 5.5 mm edge is precisely the collision that rule exists to prevent —
   and a tool has no business signing the user's shelf. The hidden Inner-Flap signature stays a Mark question, not a
   Wordmark one, and stays out of v1.
9. **The print surface is outside the theme contract.** Paper and the surface it is mounted on are literal colours in
   every theme, forever, and the Part's type comes from its own stack in `src/render/raster.ts` — never from a chrome
   token. A token can be re-themed; a literal cannot, which is the enforcement. The chrome may be re-skinned freely
   because it cannot reach the paper.

## The register, made concrete

Chosen at the screen from a switchable comparison of the six permissive collections, then measured.

**Palette: Everforest Light** (`sainnhe/everforest`, MIT). Consequence, measured across the whole palette against its own
backgrounds: **`#5c6a72` is the only colour that reaches 4.5:1** — every accent tops out at 3.13 (blue), every grey at
3.79. Three rules follow, and they are not stylistic:

- **All text is one colour.** Hierarchy is size, weight, tracking and space, never a lighter grey. Four shades of grey
  text was the previous design's whole hierarchy and is why it read as unfinished.
- **Accents are never text.** They are bars, dots, rules and fills, where 3:1 suffices. A warning is ink on a tinted
  field with an accent bar, not accent-coloured text.
- **Exactly one filled control**, ink-filled with paper text (5.18:1). No accent can carry a label: the best is blue at
  3.13, and yellow at 2.12.

Four of the sixteen colours do work — blue interactive, aqua ready, yellow warning, red error. The rest are unused, and
that is the point of adopting a named palette rather than inventing one.

**Type: JetBrains Mono Variable** (OFL-1.1, `@fontsource-variable/jetbrains-mono`), Latin + Latin-ext, roman only,
`wght` axis: **40,404 + 15,196 = 55,600 bytes (54.3 KiB)**, or +2.28 % on the single-file build (ADR-0002). The variable
axis costs the same as two static weights and delivers all of them. No italic — the chrome has none. No Greek, Cyrillic
or Vietnamese — chrome labels are English, and user-typed text falls through the stack to the Noto faces already
bundled. Body copy on a Part is **not** set in this face and never was, which is the whole of rule 9.

Amended by ticket 02 of v2: a Part is no longer set in Noto Sans either. Five more OFL faces are bundled — Source Serif 4,
Bitter, Space Grotesk, Archivo Narrow and Cabin, Latin + Latin-ext, 280,420 bytes measured — and a Template names three of
them by role (display, text, spine). Rule 6 is unaffected in the way that matters: every one of them is an outline face,
and the serif was chosen *because* it is low-contrast, since an old-style face's hairlines at the 2.4 mm the tracklist
sets fall under Sony's 0.15 mm printable-stroke floor. Noto Sans stays the fallback every print stack ends with, which is
what renders a Cyrillic title and a Japanese tracklist in faces that ship Latin only.

**Icons: Lucide** (ISC), as a source of geometry only — the glyphs actually used are vendored as inline SVG, so there is
no runtime dependency and one attribution entry. Six hand-drawn icons would be six inconsistent icons; a set supplies
stroke weight, grid and terminals as a system. Hand-drawing stays reserved for the Mark, the one place this ADR asks
for it.

**No theme switcher in v1**, though the contract is switch-ready (one block per palette, zero hardcoded hexes in the
chrome). Theming is Omarchy's product; here it is not. Every additional theme would need its own contrast verification
for warnings that carry print-critical information, and a theme picker sitting beside the **Template** colour controls
invites exactly the confusion the glossary separates: the Register is not the Template.

## The sub-brand tension from ADR-0009, resolved

0009 asked this ADR to answer it, so here is the answer. This ADR rejected Sony's ~1992 register partly because it
"reads as a Sony sub-brand"; the name **MinicovereD** now does, deliberately and on the record. The two are not in
contradiction, because the objection was never to the reading itself — it was to *stacking* it. The name spends that
exposure once. The register must therefore not spend it again:

- **The Mark must not use a solid/hollow contrast, or an M/D device, or any figure derived from the cassette.** That is
  the MiniDisc logo's own mechanism — M and D solid, every other letter hollow — and repeating it in the pictorial mark
  would be the second exposure. The Mark's job is to pull the identity *away* from Sony, not to sit beside it.
- **The Wordmark sets the name in ordinary capitals.** Emphasising the M and the D would make the borrowed device a
  visible design decision rather than a spelling convention, and 0009 is explicit that this would need recording here.
  If that is ever chosen, this paragraph is what has to change.

Rejected: reproducing a single period register, which was the original framing. Sony's own ~1992 industrial idiom duplicates the Logo's construction, reads as a Sony sub-brand, and cannot carry a pictorial mark at all. The Winamp and shareware register is the closest to the audience's actual era — MiniDisc's peak and Winamp's were the same desk — but its vocabulary *is* skeuomorphic chrome, so it cannot survive a non-reproducing treatment. The 8-bit and early-Mac registers both predate MiniDisc and belong to no part of this audience's experience. BBS/ANSI is the ancestor of the register chosen here, but its faithful form fails ADR-0003 on fonts; the contemporary monospace treatment avoids that.

Consequence: the terminal register is a developer signal, which points at the secondary audience rather than the primary one. That tension is accepted on the grounds that this scene is developer-built throughout, and because a precision print tool should look precise.

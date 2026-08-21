# Oldschool visual registers — reference wall

Working notes for picking ONE visual identity register for mdcovergen. Pick by pointing, not describing.
Constraints that judge every register: **ADR-0003** (permissive FOSS only: MIT / Apache-2.0 / ISC / OFL / CC0),
**ADR-0004** (official MiniDisc logo is bundled and optional), **ADR-0005** (J-Card spine = 5.5 mm, height 79 mm),
and **print at 300 DPI at exact mm on a home printer**. Arithmetic constant: 300 dpi = **11.811 px/mm**, 1 px = **0.0847 mm**.

Anything marked *unverified* was not confirmable from a trustworthy source in this pass. No hex or model number below is invented.

---

## 0. The fixed backdrop: what the MiniDisc domain already dictates

This is not one of the five registers — it is the wall everything else has to hang next to.

- MD cartridge is **68 × 72 × 5 mm** with a sliding shutter, "similar to the casing of a 3.5" floppy disk" (https://en.wikipedia.org/wiki/MiniDisc)
- Announced Sept 1992, released Nov 1992 in Japan, Dec 1992 elsewhere; capacities 60 / 74 / 80 min (https://en.wikipedia.org/wiki/MiniDisc)
- **The official MiniDisc logo, read off the artwork itself** (Commons SVG, 519.87 × 504 units ≈ 1.03:1): a thin-stroked **rounded-rectangle frame** enclosing the word "MiniDisc" set on **two stacked lines** ("Mini" / "Disc"). The **M and D are solid black; every other letter is a hollow outline** of uniform stroke weight — so the initials "MD" read out of the wordmark. Letterforms are monolinear, squared, condensed; the three i-dots are **square**, not round. One colour, no gradient. (https://commons.wikimedia.org/wiki/File:MiniDisc-Logo.svg)
- Commons tags that SVG **PD-textlogo** — below the threshold of originality for copyright — but carries a trademark warning (https://commons.wikimedia.org/wiki/File:MiniDisc-Logo.svg). ADR-0004 already accepts this risk.
- **Sony DADC's own artwork spec is a print spec**, and it is unusually specific:
  - Three logo artwork versions by size: **A1 ≥ 16 mm, A2 = 7–16 mm, B = 4–7 mm** (https://www.manualsdir.com/manuals/139643/sony-minidisc.html?page=25)
  - "Printing the 'MiniDisc' logo in positive, or in reverse (negative) is permitted." "**Only one color may be used**" — also single-colour backgrounds in negative (https://www.manualsdir.com/manuals/139643/sony-minidisc.html?page=26)
  - "**Never combine the 'MiniDisc' logo with other characters, figures or logos. Always display it independently.**" (same page 26)
  - Backline card: spine **11.2 mm**, panels **86.4 / 103.2 mm**, total width **108.8 mm**, ±0.2 mm; ~**3 mm bleed**; stock "wood-free art paper, 160–180 g/m² = 0,15–0,16 mm thick, coated on both sides"; logo shown at **7 mm** in spine positions 1/2/3 (https://www.manualsdir.com/manuals/139643/sony-minidisc.html?page=23)
  - Cartridge print area **59.0 × 52.4 mm**, spine **14.2**, backside **31.7**, **R 12** corner; "**min. line width 0.15 mm**"; "**Character size 7pt** recommended; Character size **min. 5pt**" (https://www.manualsdir.com/manuals/139643/sony-minidisc.html?page=24)
  - Cartridge label film **63.8 × 54.7 mm ±0.2 mm**, "R = max. 0.7 mm for all 4 corners"; on the label "the MD Logo **shall not** be inserted, as it already appears on the upper cartridge" (https://www.manualsdir.com/manuals/139643/sony-minidisc.html?page=21)

> **The 0.15 mm / 5 pt floor is the single most useful number on this page.** Sony's own factory says: below 0.15 mm a line is not reliably printable at this scale, and below 5 pt type is not reliably legible. Every register below gets judged against that.

---

## 1. Sony industrial design ~1992 (the launch era)

**Named artifacts**
- **Sony MZ-1** — world's first MD recorder, Nov 1992; slot-loading (not clamshell); backlit LCD for disc/track/time; **114 × 139 × 43 mm, 0.690 kg**, plastic housing (https://www.radiomuseum.org/r/sony_md_walkman_minidisc_portable_recorder_mz_1.html, https://walkmancentral.com/products/mz-1)
- **Sony MZ-2P** — the playback-only launch companion (https://www.hifiengine.com/manual_library/sony/mz-2p.shtml)
- **Sony MDW-60 / MDW-74** — the first blank discs, Nov 1992 (https://obsoletesony.substack.com/p/complete-visual-guide-to-sony-minidisc); MDW-74 is in the Google Arts & Culture collection (https://artsandculture.google.com/asset/minidisc-sony-recordable-minidisc-mdw-74-sony-corporation/TQFkYp0kq6v2eg)
- **The MiniDisc logo A1/A2/B artwork system** — see §0
- **The SONY wordmark** — in use unchanged since 1973 (https://www.hatchwise.com/resources/history-of-logos-sony-logo)

**Typography**
- SONY wordmark = bespoke drawn lettering; the widespread "modified Clarendon Medium" attribution appears only on font-download/logo-blog sites (https://1000logos.net/sony-logo/, https://www.fontinlogo.com/logo/sony) — **treat as unverified**, and irrelevant anyway: the wordmark is a trademark, not licensable type.
- Sony's actual corporate typeface is **SST**, drawn by Akira Kobayashi (Monotype) with Hiroshige Fukuhara (Sony Creative Center): 22,000+ glyphs, 93 languages, iF Design Award 2016 (https://www.monotype.com/resources/case-studies/one-typeface-93-languages-for-sony). **Proprietary — unusable, and anachronistic for 1992.**
- What 1992 Sony packaging actually set its type in: **unverified**. Visually it sits in the Helvetica/Univers grotesque family.
- FOSS stand-ins, licenses verified: **Inter** (OFL-1.1, https://github.com/rsms/inter/blob/master/LICENSE.txt), **IBM Plex Sans** (OFL-1.1, https://github.com/IBM/plex), **Liberation Sans** (OFL-1.1, https://en.wikipedia.org/wiki/Liberation_fonts), **DejaVu Sans** (Bitstream-derived permissive; cannot be sold standalone, rename if modified — https://dejavu-fonts.github.io/License.html)

**Palette** — Sony's spec is *anti*-palette: the logo is **one colour only**, positive or reverse. No documented Sony brand hex set found: **unverified**. MZ-1 finish colour: **unverified** (housing material documented as plastic only).

**Grid / constraints** — millimetres, not pixels. See the §0 numbers: 68 × 72 × 5 mm cartridge, 63.8 × 54.7 label, 108.8 mm backline card, 0.15 mm line floor, 5 pt type floor, 3 mm bleed.

**What a logo in this register looks like** — a monochrome wordmark or a wordmark-in-a-frame, monolinear, squared, condensed, no ornament, no gradient, generous internal whitespace, one weight. It is a *specification*, not a picture: it is defined by its minimum size tier rather than by its detail. At 16 px it survives as a legible silhouette because it has no detail to lose; at 512 px it looks the same, only larger — it never "reveals" anything.

**Print behaviour** — **best of the five, by construction.** This register was *designed for a print film*. Single ink, no halftone, no colour management, tolerances in ±0.2 mm, an explicit small-size logo variant for the 4–7 mm range that a 5.5 mm spine lands squarely inside (https://www.manualsdir.com/manuals/139643/sony-minidisc.html?page=25).

**FOSS availability** — Fonts: yes (above). Marks: the MiniDisc SVG is PD-textlogo/trademark-flagged and already bundled per ADR-0004. Sony's SONY wordmark and SST are **not** available and must never be imitated.

---

## 2. 8-bit console era (NES/Famicom, Master System, Game Boy)

**Named artifacts**
- *Super Mario Bros.* (NES, 1985) — chunky drop-shadowed block title lettering
- *The Legend of Zelda* (NES, 1986) — engraved/bevelled gold wordmark
- *Mega Man 2* (NES, 1988) — angular bold-italic wordmark
- *Castlevania* (NES, 1987) — blackletter title, the documented genre exception (https://castlevania.fandom.com/wiki/List_of_fonts_used_in_Castlevania_logos)
- *Tetris* (Game Boy, 1989) — plain white geometric sans on black
- *Alex Kidd in Miracle World* (Master System, 1986) (https://archive.org/details/alex-kidd-in-miracle-world-eu-jp-us-1986-action-platform-sega-master-system)
- Hardware: NES-001, DMG-01

**Typography** — almost entirely **custom bitmap tile lettering**, authored per game in the pattern table, not licensed type (https://www.nesdev.org/wiki/PPU_programmer_reference).
FOSS lookalikes, licenses verified: **Press Start 2P** (OFL, https://fonts.google.com/specimen/Press+Start+2P) · **Silkscreen** (OFL, https://fonts.google.com/specimen/Silkscreen) · **Pixelify Sans** (OFL-1.1, https://github.com/eifetx/Pixelify-Sans) · **VT323** (OFL-1.1, https://fonts.google.com/specimen/VT323) · **Departure Mono** (OFL, https://github.com/rektdeckard/departure-mono) · **m5x7 / m6x11** (CC0-1.0, https://managore.itch.io/m5x7). **Munro** — license unverified/mixed, avoid.

**Palette**
- NES: 64-entry master palette, 6-bit values; **4 BG + 4 sprite subpalettes × 4 colours**, entry 0 a shared backdrop; documented on-screen max **25 colours** (https://www.nesdev.org/wiki/PPU_palettes, https://forums.nesdev.org/viewtopic.php?t=4325). Lospec lists **55** distinct colours in the 64-index space (https://lospec.com/palette-list/nintendo-entertainment-system).
- Game Boy DMG: **4 grey shades**. **No official green hexes exist** — any "#e0f8d0"-style value is a community approximation, **unverified** (Pan Docs, https://bgb.bircd.org/pandocs.htm).
- Master System: 6-bit VDP (2 bits/channel) = 64 colours, two 16-colour palettes = **32 simultaneous** (https://www.smspower.org/Development/Palette).

**Grid / pixel constraints** — 8×8 tiles everywhere. NES **256×240**, sprites 8×8/8×16, **8 sprites/scanline**, attribute granularity **16×16 px** (https://www.nesdev.org/wiki/PPU_programmer_reference). Game Boy **160×144** (20×18 tiles), 40 sprites, **10/scanline** (https://bgb.bircd.org/pandocs.htm). Master System **256×192**.

**What a logo looks like** — a wordmark built on a visible 8×8 grid: thick uniform strokes, stair-stepped diagonals, a 1–2 px hard outline or an offset hard drop shadow, colour applied in flat 3–4 colour bands. Almost never a pictorial mark. At 16 px it is a coloured blob; it only resolves into letterforms around 64 px and above, so it needs a separate tiny-size variant.

**Print behaviour** — survives **only under integer upscaling**. 1× = 0.085 mm/px (invisible). 4× = 0.339 mm · 8× = 0.677 mm · 16× = 1.354 mm · 24× = 2.032 mm. Practical crispness floor ≈ **4–6× (0.3–0.5 mm per art pixel)**, which comfortably clears Sony's 0.15 mm line floor. Any non-integer scale or resampling filter turns tile edges into grey halftone mush — that is the one real failure mode. On a 5.5 mm spine you get ~16–24 art pixels of height: enough for one line of 8 px-tall tile lettering at 2–3×, not enough for two.

**FOSS availability** — fonts: excellent (list above). Palettes: hardware RGB values are facts and freely usable; **Lospec palette *files* are not blanket-CC0** — check per-palette (https://lospec.com/terms-and-conditions).

---

## 3. Winamp / shareware era, late 1990s

**Named artifacts**
- **Winamp 0.92** (May 1997) — introduced the silver 3D UI + green spectrum analyser; **Winamp 1.91** (Apr 1998) shipped DEMO.MP3; **Winamp 2.0** (Sept 8, 1998) (https://en.wikipedia.org/wiki/Winamp)
- "**Winamp, it really whips the llama's ass!**" — the DEMO.MP3 clip, voiced by JJ McKay, referencing Wesley Willis; mascot DJ Mike Llama (https://tedium.co/2017/11/20/wesley-willis-winamp-history/)
- **Winamp Skin Museum** — 65,000+ .wsz skins, browsable in 10 seconds (https://skins.webamp.org/about)
- Classic skin bitmaps: **MAIN.BMP 275×116**, CBUTTONS.BMP 136×36, TITLEBAR.BMP 344×87 (http://justsolve.archiveteam.org/wiki/Winamp_Skin)
- **WinZip 6.2** (1996) (https://archive.org/details/WINZIP95_EXE) · **mIRC 5.0** (Apr 1997) · **WinRAR 2.00** (Sept 1996) · **Paint Shop Pro 4.15 SE / 5.01** (1998, https://winworldpc.com/product/paint-shop-pro/5x) · **ACDSee 95** (1997) · **GetRight** (Feb 1997)

**Typography** — Winamp classic uses **bitmap strips**, not fonts: TEXT.BMP (155×18) and NUMS_EX.BMP (108×13) (https://www.alpha-ii.com/Info/Template.html). Windows 95's UI font was **MS Sans Serif**; Tahoma only became the default at Windows 2000 (https://en.wikipedia.org/wiki/Tahoma_(typeface)). Readmes/NFOs were read in Terminal or Fixedsys.
FOSS lookalikes, verified: **W95FA** (OFL, an MS Sans-alike, https://fontsarena.com/w95fa-by-alina-sava/) · **Liberation Sans** (OFL-1.1) · **DejaVu Sans** (permissive w/ caveats) · **IBM Plex Mono** (OFL-1.1) · **Cascadia Code** (OFL) · **Luculent** (OFL-1.1).

**Palette** — Win95 3D face = **#C0C0C0**, documented by Microsoft (https://learn.microsoft.com/en-us/previous-versions/visualstudio/visual-studio-6.0/aa248848(v=vs.60)). ButtonShadow / ButtonHighlight / ButtonDkShadow **Win95-era** defaults: **unverified** (only post-XP values found). The 20-entry Windows static palette mechanism is documented but its RGB values are **not enumerated** by Microsoft (https://learn.microsoft.com/en-us/windows/win32/gdi/system-palette-and-static-colors) — the popular "#C0DCC0 money green / #A6CAF0 sky blue" lists are secondary-source only. Winamp's default visualiser greens live in VisColor.txt; no documented defaults found: **unverified**.

**Grid / pixel constraints** — icons at 16×16 / 32×32 / 48×48 in 16- and 256-colour depths. The Win95 3D border is literally **two 1 px lines** per edge, light upper-left, dark lower-right (Microsoft, *The Windows Interface Guidelines for Software Design*, 1995, https://archive.org/details/windowsinterface00micr). Winamp main window **275×116**, "double size" **550×232**.

**What a logo looks like** — a flat saturated fill with a hard 1 px outer edge plus a 1 px light/dark bevel pair faking a raised plastic button, sitting on mid-grey rather than white; gradients are coarse ordered-dither ramps, shadows are hard-edged whole-pixel offsets. At 16 px the bevel is unreadable and the mark collapses to a silhouette; at 512 px it must still look like chunky pixel art rather than resolve new detail.

**Print behaviour** — **worst of the five.** A 1 px bevel at 300 dpi is **0.085 mm** — well under Sony's own 0.15 mm line floor, i.e. it will feather or vanish. On the 5.5 mm spine a 1 px line is 1/65th of the width. Grey-on-grey chrome (#C0C0C0 vs a mid grey) depends on precise neutrals and crisp edges on an emissive screen; a consumer printer builds those greys from halftoned CMY with a colour cast, so the 3D illusion dies. Dithered 256-colour gradients meet the printer's own halftone screen → **moiré**. To survive, bevels need ≥3–4 device px (0.25–0.34 mm) per edge, which is no longer faithful to the register.

**FOSS availability** — fonts yes (above). **Assets no**: Webamp is MIT (https://github.com/captbaritone/webamp) but the .wsz skin art it renders is archival third-party material, not licence-cleared. No verified-permissive Win95/shareware icon set was found — assume any such set is an unlicensed redraw.

---

## 4. BBS / ANSI art

**Named artifacts**
- **ACiD Productions**, founded 1 Sept 1990 as "ANSI Creators in Demand" (https://en.wikipedia.org/wiki/ACiD_Productions) · **iCE Advertisements**, 1991 (https://en.wikipedia.org/wiki/ICE_Advertisements) · **Blocktronics**, first pack 19 Aug 2008, 43 packs to 2022 (https://16colo.rs/group/blocktronics)
- Real packs to open right now: **acdu0195** (ACiD, 1995, https://16colo.rs/pack/acdu0195) and **acid-50a** (Sept 1996, https://16colo.rs/group/acid)
- **FILE_ID.DIZ** — ≤10 lines × ≤45 chars, spec v1.9 released to the public domain (https://en.wikipedia.org/wiki/FILE_ID.DIZ)
- **.nfo** — warez-scene convention, first documented 1990 with The Humble Guys (https://en.wikipedia.org/wiki/.nfo)
- **ansilove** — the renderer, **BSD-2-Clause** (https://github.com/ansilove/ansilove/blob/master/LICENSE)

**Typography** — the IBM PC VGA text font: **8×16 glyphs drawn in 9-px-wide cells**, with column 8 duplicated into column 9 for codepoints 0xC0–0xDF so box-drawing joins (https://en.wikipedia.org/wiki/VGA_text_mode). Repertoire = **CP437** (https://en.wikipedia.org/wiki/Code_page_437).
**Licence trap — the best-looking fonts here are share-alike:** VileR's Oldschool PC Font Pack is **CC BY-SA 4.0** (https://int10h.org/oldschool-pc-fonts/readme/) and PxPlus IBM VGA8 likewise **CC BY-SA 4.0** — **both fail ADR-0003**. Fixedsys Excelsior: conflicting terms, **treat as blocked**.
Permissive alternatives: **Terminus** (OFL-1.1 since 4.32, https://terminus-font.sourceforge.net/) · **Cozette** (MIT, https://github.com/slavfox/Cozette) · **IBM Plex Mono** (OFL-1.1) · **GNU Unifont** via its OFL-1.1 option (https://unifoundry.com/unifont/).

**Palette** — 4-bit **IRGB**; each 2-bit channel maps to 0/85/170/255. Documented 16: `#000000 #0000AA #00AA00 #00AAAA #AA0000 #AA00AA #AA5500 #AAAAAA #555555 #5555FF #55FF55 #55FFFF #FF5555 #FF55FF #FFFF55 #FFFFFF` (https://moddingwiki.shikadi.net/wiki/EGA_Palette). ANSI.SYS natively gave 16 fg / 8 bg; "**iCE colors**" repurpose the blink bit for all 16 backgrounds (https://forum.16colo.rs/t/ice-colors-or-blinking-text/27).

**Grid / pixel constraints** — **80×25** cells; VGA text mode renders **720×400** with 9×16 non-square pixels (https://en.wikipedia.org/wiki/VGA_text_mode). Half-blocks ▀ U+2580 / ▄ U+2584 double effective vertical resolution; shade ramp ░ U+2591 · ▒ U+2592 · ▓ U+2593 · █ U+2588 = CP437 bytes **176/177/178/219** (https://en.wikipedia.org/wiki/Block_Elements, https://www.ascii-code.com/CP437).

**What a logo looks like** — built entirely from full/half/quarter blocks and the ░▒▓ ramp in a hard 16-colour palette: gradients *are* dither patterns, diagonals are unapologetically stair-stepped, and the mark is either a bold blocky wordmark or a pictorial scene, rarely both. A 9×16 cell is already favicon-scale, so it degrades gracefully to 16 px (one flat glyph) and scales up by adding cells rather than detail.

**Print behaviour** — mixed, and it splits cleanly. **Solid glyphs (█, half-blocks) print beautifully** — flat fills, monochrome-native, no colour management, designed around discrete non-blended colour. A 9×16 cell: 1× = 0.76 × 1.35 mm · 2× = 1.52 × 2.71 mm · 3× = 2.29 × 4.06 mm · 4× = 3.05 × 5.42 mm. A **5.5 mm spine fits exactly one 4×-scaled character row** with no margin; 2–3× is the safe legible floor. **The ░▒▓ shading glyphs are the hazard** — they are fixed-frequency dither patterns, and laying one over an inkjet's own halftone screen is textbook moiré. Rule of thumb: use █ and half-blocks, avoid ░▒▓ below ~3×.

**FOSS availability** — tooling: ansilove (BSD-2-Clause). Fonts: Terminus (OFL), Cozette (MIT), IBM Plex Mono (OFL), Unifont (OFL option). **Avoid**: VileR pack and PxPlus (CC BY-SA), Ubuntu Mono (UFL font-copyleft), Fixedsys Excelsior (unverified).

---

## 5. Early Mac OS (System 1–7)

**Named artifacts**
- **Happy Mac** (Susan Kare, Nov 1983) and **Sad Mac** (https://apple.fandom.com/wiki/Happy_Mac)
- **Trash can** — Kare's pencil-on-graph-paper sketchbook is in MoMA's collection (https://www.moma.org/collection/works/188382)
- **Clarus the dogcow** — named in a March 1989 Apple document, Technical Note #31/TN1031, "Moof!" (https://en.wikipedia.org/wiki/Dogcow)
- **Wristwatch wait cursor** — the actual System 1–7 wait cursor. The **spinning beachball is Mac OS X, 2001 — wrong era, do not use** (https://eclecticlight.co/2017/10/28/why-the-spinning-beachball/)
- **⌘** — Kare picked it from an international-symbols book; a Nordic place-of-interest sign (https://www.folklore.org/Swedish_Campground.html)
- **The Bomb / System Error dialog** — Kare, deliberately playful rather than alarming (https://en.wikipedia.org/wiki/Bomb_(icon))
- **MacPaint 1.0** patterns palette — Atkinson's code, Kare's UI/patterns/icons (https://www.computerhistory.org/atchm/macpaint-and-quickdraw-source-code/)
- **The QuickDraw RoundRect** — the shape itself, after Jobs' "rectangles with rounded corners are everywhere" (https://www.folklore.org/Round_Rects_Are_Everywhere.html)

**Typography** — **Chicago, Geneva, Monaco, New York, Venice, London, Toronto, Cairo, Los Angeles, Athens** and the 1984 ransom-note **San Francisco** (not the modern Apple SF), all by Susan Kare (https://en.wikipedia.org/wiki/Chicago_(typeface), https://en.wikipedia.org/wiki/San_Francisco_(decorative_typeface)). Originally named for Philadelphia Main Line rail stops until Jobs asked for world-class cities (https://typographica.org/on-typography/susan-kare-on-original-mac-font-names/). Chicago was the **12 pt** system font through System 7.6. **Apple still trademarks Chicago®, Monaco®, New York® today** (https://www.apple.com/legal/intellectual-property/trademark/appletmlist.html) — the originals are unusable.
FOSS, verified: **Silkscreen** (OFL-1.1, https://github.com/googlefonts/silkscreen) · **Pixel Operator** (CC0-1.0, https://fontlibrary.org/en/font/pixel-operator) · **Departure Mono** (OFL, https://github.com/rektdeckard/departure-mono).
**Flagged**: Grand9K Pixel (CC BY-SA 3.0 — fails ADR-0003) · ChiKareGo (CC terms unconfirmed) · ChicagoFLF (conflicting "public domain" vs "personal use only" — **blocked**) · "Sysfont" (unverified, does not clearly exist).

**Palette** — **exactly 2 colours.** 512×342, 1 bpp, no greys; tone is ordered dither, the 50% checkerboard being the desktop (https://en.wikipedia.org/wiki/Macintosh_128K, https://512pixels.net/2025/05/original-macintosh-resolution/). Colour only arrives with the Macintosh II (1987), 8-bit via Color QuickDraw (https://lowendmac.com/1987/mac-ii/). No documented hex values — there are none to document.

**Grid / pixel constraints** — **ICN# = 32×32 1-bit + 1-bit mask; ics# = 16×16 1-bit + mask** (https://dev.os9.ca/techpubs/mac/Toolbox/Toolbox-448.html). Menu bar **20 px** (https://developer.apple.com/library/archive/documentation/mac/Toolbox/Toolbox-128.html). Screen at **72 ppi**, matched to 72 pt/inch for WYSIWYG; the ImageWriter printed at 144 dpi, exactly 2×.

**What a logo looks like** — hand-placed pixels on a fixed grid, zero anti-aliasing, a solid 1 px black outline, dither fills instead of gradients, and a rounded-rectangle silhouette. The convention is a pictorial glyph paired with a Chicago-set wordmark. **A 16×16 ics# *is* a favicon** — no redrawing needed, which is unique among these five. At 512 px it needs either a full redraw or hard nearest-neighbour integer upscaling; any smooth scale is alien to the register.

**Print behaviour** — **the second-best of the five, and the best of the pixel registers.** 1-bit art is the ideal home-printer payload: pure black, no halftone, no colour management, no dot-gain ambiguity. A 32×32 icon at 1:1 300 dpi dots = **2.71 mm**; at 4× = **10.84 mm**. Note 300/72 = **4.1667, not an integer** — so scale by clean **4× or 5×**, never by matching original physical size. Only hazard: the 50% checkerboard can moiré against the printer's screen or flatten into grey at small size; at integer scale-ups the cells stay several printer dots wide and hold.

---

## 6. Which registers collide with the MiniDisc domain

The binding constraint is Sony DADC's own rule: "**Never combine the 'MiniDisc' logo with other characters, figures or logos. Always display it independently**", and "**only one color may be used**" (https://www.manualsdir.com/manuals/139643/sony-minidisc.html?page=26). Any project mark must therefore read as a *separate* mark, in a *different* visual language, at a *different* scale — and it has to do that inside a 5.5 mm spine where the MiniDisc logo itself is a version-**B** (4–7 mm) asset (https://www.manualsdir.com/manuals/139643/sony-minidisc.html?page=25).

**Collides — do not pick**

- **Sony industrial design ~1992.** The direct collision. A monochrome, monolinear, squared, single-weight wordmark *is* the MiniDisc logo's own construction. Put a second one next to it on a 5.5 mm spine at 4–7 mm and a reader cannot tell which mark is the format and which is the tool — worse, an mdcovergen mark in this register looks like a Sony sub-brand, which is exactly the trademark impression ADR-0004 is already stretched to accommodate. It is also the register whose type is least available: SONY and SST are both off-limits.
- **Winamp / shareware era.** Collides on a different axis: not with the logo, with the *paper*. 1 px bevels are 0.085 mm, below Sony's documented 0.15 mm printable line floor; grey-on-grey chrome and dithered gradients fail in home-printer CMY. And its palette-heavy, multi-colour, softly-shaded look sits badly beside a mark that is specified as one flat ink. Screen-only register.

**Sits comfortably next to the MiniDisc logo**

- **Early Mac OS (System 1–7).** The strongest fit. It is 1-bit — automatically compliant with "only one colour" — and it is *pictorial*, so it never competes with a wordmark. Its native units (16×16 favicon, 32×32 icon at 4× = 10.8 mm) are print-real, its rounded-rectangle silhouette rhymes with the MD cartridge's own R-12 corner without imitating the logo, and its 1980s hand-drawn-pixel voice is unmistakably *not* Sony. FOSS type is clean (Silkscreen OFL, Pixel Operator CC0).
- **BBS / ANSI art**, with one restriction. Also monochrome-friendly and flat-ink-native, and a 9×16 cell at 2–3× fits the spine. But it must be built from █ and half-blocks only; the ░▒▓ ramp is a dither pattern that risks moiré against the printer's halftone, and the two best CP437 font packs are CC BY-SA and fail ADR-0003. Workable on Terminus/Cozette, with discipline.
- **8-bit console era**, conditionally. No conflict with the MD logo's language — it is colourful, chunky and obviously a game-title voice, so the two marks never blur. The condition is mechanical: integer scaling only, at ≥4× (≈0.34 mm per art pixel), which clears Sony's 0.15 mm floor with room to spare. On a 5.5 mm spine that buys ~16–24 art pixels of height — one line of tile lettering, not two. Font supply is the best of all five (Press Start 2P, Silkscreen, Pixelify Sans, VT323, m5x7, all OFL or CC0).

**One-line verdict for the wall:** *Early Mac OS is the register that is simultaneously 1-bit (obeys Sony's one-colour rule), pictorial (never confused with a wordmark), print-native (pure black at integer scale), and cleanly FOSS.*

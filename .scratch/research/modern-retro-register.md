# Modern-retro register — "modern but oldschool"

Companion to `oldschool-registers.md` (five *period* registers, rejected). Different question: not "which era do we reproduce"
but **"how do you read as oldschool without reproducing an era."** Two reference points given: **Omarchy** and **modern pixel art games**.

Judged against **ADR-0003** (permissive FOSS only: MIT / Apache-2.0 / ISC / OFL / CC0; **CC BY-SA and NC fail**).
Anything not confirmed from a primary source is marked *unverified*. No invented hex, resolution, or license below.

---
## 1. Omarchy — what it actually is, read off the assets

**The project.** Arch Linux + Hyprland, "Beautiful, Modern & Opinionated Linux by DHH" (David Heinemeier Hansson, 37signals).
Repo `basecamp/omarchy` created **2025-06-01**, **MIT** licensed, ~27k stars.
(https://omarchy.org/, https://github.com/basecamp/omarchy, `GET /repos/basecamp/omarchy`)
Announced by DHH **2025-06-26** as "a paved path into the glorious world of Linux ricing" with "beautiful configurations for Hyprland"
(https://world.hey.com/dhh/omarchy-is-out-4666dd31). Omacom Foundation launched with $8M, Aug 2026
(https://omarchy.org/news/2026/08/omacom-foundation-launches-with-8-million).

### 1a. The mark — this is the whole lesson

Omarchy has **three** forms of one mark, and every one of them is grid geometry:

| Asset | What it literally is | Source |
|---|---|---|
| `logo.txt` / site hero | **ANSI block-character art** — the word OMARCHY drawn in `█ ▄ ▀` inside a `<pre>` tag. Not an image. Selectable text. | https://raw.githubusercontent.com/basecamp/omarchy/master/logo.txt |
| `logo.svg` | **Vector, but on a pixel grid.** viewBox `0 0 1215 285` = **81 × 19 cells of 15 units**. Path commands used: **only `m h v l z` — zero curves.** Every vertex lands on the 15-unit grid (max deviation 0.003). A bitmap wordmark expressed as resolution-independent vector. | https://raw.githubusercontent.com/basecamp/omarchy/master/logo.svg (measured) |
| `icon.png` = `favicon.png` | 300 × 300, **exactly two colours**: transparent and **`#9ece6a`** at full alpha. **No anti-aliasing at all.** Run-lengths are all multiples of 20 px → a **15 × 15 module grid**. A maze-like nested-square glyph reading as an "O". | https://raw.githubusercontent.com/basecamp/omarchy/master/icon.png (decoded) |

Also shipped as `config/omarchy.ttf`, commented "Omarchy logo in a font for Waybar use"
(https://raw.githubusercontent.com/basecamp/omarchy/master/install/packaging/fonts.sh) — so the mark is *also* a font glyph.

> **The favicon works at 16 px because it was never drawn at 300 px.** It is a 15×15 grid scaled up, 1-bit, hard-edged.
> That is the single most portable idea on this page.

**But the UI icons are not pixel.** Of the 12 inline SVGs on omarchy.org, **11 use bezier curves** (`c`/`s`); only the News icon
is orthogonal (measured from the page source). Manual/News/ISO/GitHub/Discord/Merch icons are smooth modern vector.
**So: grid mark, smooth icons.** The retro is concentrated in one place and not smeared over everything.

### 1b. Typography

- Site: **JetBrains Mono** only, self-hosted woff2, 10 faces (300–700 + italics), `--font-family: 'JetBrains Mono', monospace`
  (omarchy.org/assets/css/fonts.css, /root.css). **OFL-1.1** → passes ADR-0003 (github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt).
- Distro fontconfig: monospace → **JetBrainsMono Nerd Font**, sans → **Liberation Sans**, serif → **Liberation Serif**
  (…/master/config/fontconfig/fonts.conf). Nerd Fonts repo license = `NOASSERTION` per the GitHub API — *unverified*, check per-font.
- **No pixel font anywhere.** The oldschool signal is *monospace + block characters*, not a bitmap typeface.

### 1c. Colour

Site `root.css` is **Tokyo Night**, matching Omarchy's own `themes/tokyo-night/colors.toml` exactly: `#1a1b26` night bg, `#24283b`
storm bg, `#9ece6a` green, `#7aa2f7` blue, `#7dcfff` cyan, `#c0caf5` white, `#414868` border (omarchy.org/assets/css/root.css).
The theme model is **ANSI 16** (`color0`…`color15` + fg/bg/cursor/selection/accent) — a terminal palette contract, not a design system.
**22 themes ship**: catppuccin(-latte), ethereal, everforest, flexoki-light, gruvbox, hackerman, kanagawa, last-horizon, lumon, lupine,
matte-black, miasma, nord, osaka-jade, retro-82, ristretto, rose-pine, solitude, tokyo-night, vantablack, white. **Only 2 of 22 are
period-flavoured** — `retro-82` (amber phosphor `#faa968`/`#f6dcac`) and `hackerman` (`#82FB9C` on `#0B0C16`). Retro is an *option*, not the identity.

### 1d. Retro vs contemporary — the actual split

| Oldschool | Contemporary |
|---|---|
| ANSI block-art wordmark in a `<pre>` | `clamp()` fluid type, CSS custom properties, CSS grid, `cubic-bezier(.33,1,.68,1)` hover transitions |
| Monospace for *everything*, including body copy and H1 | Self-hosted woff2, `font-display: swap`, 10 optical weights |
| 16-colour ANSI palette contract | Wayland/Hyprland GPU compositing, animation, blur |
| TUI-first tooling, keyboard-driven tiling WM | Smooth bezier SVG iconography |
| 1-bit hard-edged favicon | `letter-spacing: -0.0425em` on the `<pre>` to close block-glyph gaps — a typographic fix no 1985 terminal could make |

`.pre pre { font-size: clamp(0.425rem, 1.25vw, 1rem); letter-spacing: -0.0425em; line-height: 1.09375; }`
(https://omarchy.org/assets/css/pre.css) — **that one rule is the thesis**: a genuinely oldschool artifact delivered with
entirely contemporary technique. Nothing is skeuomorphic. There is no CRT filter, no scanline, no beveled window chrome, no fake wear.

### 1e. How the docs present it

The **README is three sentences** — name, tagline, MIT link. The manual is hosted on **Writebook** (37signals' own book app) at
learn.omacom.io — **plain white, sans-serif, book-like, no terminal styling at all**. The identity lives on the landing page and
inside the terminal, and is **deliberately not carried into the docs**.

---
## 2. Modern pixel art — what makes it modern rather than 8-bit reproduction

**The 8-bit baseline** (https://www.nesdev.org/wiki/PPU_palettes, verbatim): "Backgrounds and sprites each have 4 palettes of 4
colors"; "Entry 0 of each palette is unique in that it is transparent"; "A 6-bit value… corresponds to one of **64 outputs**" — which
contain duplicates. The quoted **54** distinct colours is a *developer* figure (Yacht Club, yachtclubgames.com/blog/breaking-the-nes/),
and **25** on screen is derived arithmetic (forums.nesdev.org/viewtopic.php?t=4325). NES output was 256×240.

- **Resolution is chosen, and chosen to divide into HD.** Celeste = **320×180**, stated twice by the team: Noel Berry, "Our screen
  resolution is tiny (320x180)" (https://noelberry.ca/posts/celeste_lighting/); artist Pedro Medeiros, "On Celeste I chose 320x180…
  multiply 320x180 by 6, you get exactly [1920×1080]" (https://saint11.art/blog/consistency/). Shovel Knight = **400×240** — Yacht
  Club: "An NES outputs at 256×240… The only difference is additional horizontal space" (Breaking the NES).
  ⚠️ **Community resolution figures are unreliable**: D-Pad Studio asserts a 640×360 convention "in Hyper Light Drifter, Iconoclasts
  and even Shovel Knight" (https://dpadstudio.com/Blog/postHibit.html) — contradicted by Yacht Club's own 400×240.
  *Unverified, do not quote: Hyper Light Drifter, Katana Zero, Signalis, Sea of Stars, Owlboy, Eastward, Dead Cells.*
- **Palette broken on purpose, with receipts.** Yacht Club added exactly four non-NES colours, published: `#22123B`, `#360900`,
  `#9E9E5C`, `#824e00` — the last because "the default NES color palette provides very few tools to create a character with darker
  skin tones." Sprites got "4-5 colors… in addition to transparency" vs the NES's 3; palette cycling runs in a **pixel shader**.
- **Normal maps and toon shading under the pixels.** Dead Cells: Thomas Vasseur rigs in 3DS Max, exports FBX, and "a little homebrew
  program… renders the mesh in a very small size and without antialiasing"; then "we export each frame… **along with its normal map**,
  allowing us to render the volume using a basic toon shader." Cost admitted: "we still haven't found any solution for flickering
  pixels." (gamedeveloper.com → "Art Design Deep Dive: Using a 3D pipeline for 2D animation in Dead Cells")
- **Shader lighting over a 320×180 frame.** Celeste packs one light per colour channel into a 2048×2048 atlas (256 lights max), two
  passes (Berry, above). Sea of Stars: "Full-on dynamic lighting… our custom-made render pipeline"
  (https://sabotagestudio.com/presskits/sea-of-stars/ — *normal maps: unverified*). Eastward: "a 3D game with a 2D perspective… we
  rebuild all the assets in a 3D environment, ready to be hand painted in the bump map"
  (https://www.gamedeveloper.com/art/eastward-s-creators-share-insights-on-making-pixel-art-adventures).
- **Signalis is 3D wearing pixels**, per rose-engine's own press kit: "using low-poly 3D models and 2D sprites to create fluid
  animations blended with a **pixel-perfect look**", "Striking pixel-art anime aesthetic"
  (http://rose-engine.org/press/Presskit_SIGNALIS.html). *Its specific dither/pixelation shader is unverified.*
- **1-bit as a post-process.** Obra Dinn renders in 8-bit greyscale and thresholds to 1-bit against "an 8x8 bayer matrix… and a
  128x128 blue noise field", dither camera-stabilised via `DitherOffset = ScreenSize * CameraRotation / CameraFov`; Pope then
  supersamples and concedes "the output is no longer 1-bit" (https://dukope.com/devlogs/obra-dinn/tig-32/).
- **Sub-pixel movement is documented, not folklore.** Maddy Thorson, *Celeste and TowerFall Physics*: "All collider positions, widths,
  and heights are integer numbers… **Since positions are represented as integers we can't move in fractions of pixels, so we only move
  when the rounded remainder is non-zero.**" Confirmed in the released source (`ZeroRemainderX/Y()`,
  github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs). The inverse — camera moving at *screen* resolution then snapping to
  integer coords when it stops — is Medeiros' in *Consistency*.
- **Mixing resolutions has explicit rules.** Medeiros, *Scaling Pixel Art* (https://saint11.art/blog/scaling/): "Every time someone
  mixes pixel art resolutions, an angel dies" — then: integer multiples only ("100% and others at 200%, but never at 150%"), "Do not
  mix more than two resolutions," and "**Instead of mixing pixel art resolutions, consider mixing pixel art with high resolution.**"

---
## 3. THE CRUCIAL FINDING — how modern pixel games treat their own logo

Verified per title by downloading the **official Steam store logo/capsule assets** and inspecting letterforms at native resolution
(nearest-neighbour zoom on every borderline case). Not from wikis or memory.

| Game | Logo verdict | Letterforms | Source |
|---|---|---|---|
| Celeste | **smooth vector** | chunky rounded bold caps, flat 3D extrude, gradient, snow-cap drips; smooth Béziers at 3× | store.steampowered.com/app/504230/ |
| Hyper Light Drifter | **PIXEL** | angular rune glyphs on a hard grid, 1-px stair-stepped diagonals, single-pixel diamond counters | store.steampowered.com/app/257850/ |
| Signalis | **smooth vector** | hairline geometric sans caps, extreme tracking, true circular bowls | store.steampowered.com/app/1262350/ |
| Dead Cells | **smooth vector** | tall condensed display caps, flared gothic spurs, clean vector edges | store.steampowered.com/app/588650/ (capsule) |
| Katana Zero | **smooth / hand-lettered** | outlined neon rounded caps + brush script; retro comes from a CRT-scanline + chromatic-aberration **effect layer**, not letterforms | store.steampowered.com/app/460950/ |
| Sea of Stars | **smooth vector** | high-contrast Trajan-style classical serif caps | store.steampowered.com/app/1244090/ |
| Chained Echoes | **smooth vector** | metallic gold bevelled serif caps, gradient sheen | store.steampowered.com/app/1229240/ |
| Blasphemous | **smooth / hand-lettered** | gold blackletter lowercase, roughened chipped contours | store.steampowered.com/app/774361/ |
| Owlboy | **smooth vector** | geometric caps with white keyline, "O" as an owl face | store.steampowered.com/app/115800/ |
| Eastward | **smooth (brush)** | heavy ink-brush caps, ragged organic edges, irregular baselines | store.steampowered.com/app/977880/ |
| Stardew Valley | **PIXEL** | wooden-plank letters with nail heads, 1-px stair-stepping, hand-placed dither | store.steampowered.com/app/413150/ |
| Shovel Knight | **smooth vector** | glossy bevelled slab caps, gold gradient — NES box-art *in spirit*, entirely smooth | store.steampowered.com/app/250760/ |
| Undertale | **PIXEL** | aliased blocky caps at very low res, 1-px outline, pixel heart in the "R" | store.steampowered.com/app/391540/ |
| Terraria | **PIXEL** | letters built from the game's own dirt-block / grass / ore tiles at tile resolution | store.steampowered.com/app/105600/ |
| Enter the Gungeon | **smooth vector** | heavy blocky caps with mitered cuts that *evoke* pixels, but the circles are true circles; paper texture + chromatic fringe | store.steampowered.com/app/311690/ |
| *Hollow Knight* (non-pixel control) | smooth vector | Didone serif caps with filigree | store.steampowered.com/app/367520/ |

### The answer

> **The convention is "pixel in the content, modern type in the mark." 11 of 15 pixel-art titles use a smooth vector or
> hand-lettered wordmark; only 4 use genuine pixel lettering.**

Two corollaries that are directly actionable:

1. **All four pixel logos are "letters made of the game's own substance"** — Terraria's dirt blocks, Stardew's wooden planks,
   Undertale's own UI font, HLD's in-fiction rune alphabet. **Pixel lettering reads as intentional only when it is diegetic.**
   None of them is "a nice pixel font applied to the title." That is the failure mode.
2. **Several buy the retro back with an effect layer instead of pixel letterforms** — CRT scanlines + chromatic aberration
   (Katana Zero, Gungeon), or a glossy NES-box-art bevel (Shovel Knight). The mark stays smooth; the *treatment* is period.

The smooth 11 fall into three families: classical serif, gothic/blackletter, and bold custom display.
**Cross-check against §1: Omarchy does the exact inverse** — grid-built wordmark, smooth vector icons. Both point the same way:
**the retro signal is placed in exactly one layer and the rest of the system is contemporary.** Nobody does pixel everywhere.

---
## 4. Is there a name for it? — and what separates credible from pastiche

**"Hi-bit" is the only term with a traceable primary definition,** and it is a studio blog post, not a critical coinage.
Jo-Remi Madsen, **D-Pad Studio** (Owlboy), *The Hi-Bit Era* (https://dpadstudio.com/Blog/postHibit.html): "these new games that LOOK
8-bit and 16-bit, they're not are they? Nope… They've pushed beyond the limitations of the old formats… **Any pixel art game that
operates beyond the limitations of the old 8/16/32-bit consoles can be defined as hi-bit.**"

Negative findings: **Lospec has no "hi-bit" definition** — it self-describes as "a home for digitally restrictive art"
(https://lospec.com/about); the term's real currency is an itch.io storefront tag. **"Neo-retro" has no primary practitioner
definition** (only SEO content) — treat it and "modern retro" as descriptive. **"Demake"** = a remake for an older/less-capable
platform (https://en.wiktionary.org/wiki/demake), popularised by TIGSource's **Bootleg Demakes** competition, Aug 2008
(https://archive.org/details/TIGSourceBootlegDemakes) — the *inverse* move: a demake gives up the tech, modern pixel art keeps it.
*The common attribution of the coinage to Phil Fish is **unverified**.*

**The credible/pastiche line, drawn explicitly, three times:**
- **Choice, not constraint.** Shingo Kabaya (Hattori Graphics) to Alan Wen: "**the constraints of today's pixel art are not technical
  limitations, but rather ones we create or choose for our own purposes**"; the notion that "'pixel art equals 8-bit consoles' has
  begun to fade." Wen's framing *is* the line — pixel art "neither modernised to the point that what makes it so appealing is lost,
  nor merely reproducing what was done in previous eras" (creativebloq.com → "Forget nostalgia, modern pixel art is more than retro gaming").
- **Depth, not surface.** Yacht Club: "we hope that by being **true to the NES in more than just superficial ways**, we've built
  fanciful rock-solid fundamentals." Their brief: "What if development for the NES never stopped?"
- **Quarantine and intent.** Medeiros, *Consistency*: "we designed 3 worlds with distinct styles: Game, UI, and Map. Pixel art, high
  resolution, and 3D… **The trick here is the quarantine; styles never leak from one world to another.** The major downside is that we
  had to draw it three times." And "**intent is key**… as long as you follow the rules you set (or break them with intent)." His
  diegetic test from Earthblade: a floating status icon had to be *redrawn* hi-res, because a pixel one "would mean the character
  would have an in-world icon floating above his head" — **non-diegetic information does not get pixels.**

Definitions worth keeping: Derek Yu — "Pixel art is defined by its constraints… **nostalgia aside**, it remains a fun and rewarding
challenge" (https://www.derekyu.com/makegames/pixelart.html); Medeiros — "low-resolution art where the placement of every pixel is
intentional." Also unverified: any "Lospec 1-bit jam" (Lospec Jam is a *fantasy-console* jam).

> **Working definition for this project:** pastiche is *applying* a retro artefact (a pixel font, a scanline overlay, a window
> chrome) to something. Credible modern-retro is *choosing one layer* to be grid-built, building it specifically, quarantining it,
> and leaving the rest honestly contemporary.

---
## 5. FOSS assets, licenses verified (ADR-0003: MIT / Apache-2.0 / ISC / OFL / CC0 pass; CC BY-SA and NC fail)

### 5a. Contemporary pixel/bitmap fonts

| Font | Designer | License (verified) | Web-ready | Designed size |
|---|---|---|---|---|
| **Departure Mono** | Helena Zhang | ✅ **OFL-1.1** — site meta: "a monospaced pixel font by Helena Zhang, licensed under the SIL OFL" (departuremono.com); repo-root MIT covers the **website only**, font license is `public/assets/LICENSE` | ✅ woff2/woff/otf committed | README: "set the font size to increments of **11px**" |
| **Silkscreen** | Jason Kottke | ✅ **OFL-1.1** — `google/fonts/ofl/silkscreen/METADATA.pb` → `license: "OFL"` | ✅ Google Fonts woff2; `@fontsource/silkscreen@5.3.0` = OFL-1.1 | glyphs max **5×5 px**; use at 8pt multiples, AA off |
| **Pixel Operator** | Jayvee Enaguas | ✅ **CC0-1.0** — author's own note on dafont.com/pixel-operator.font | ⚠️ TTF only; upstream notabug repo is **404** — vendor the TTFs | dafont classes it **16 px** (+ 8 px variants) |
| **m5x7** | Daniel Linssen | ✅ **CC0-1.0** — itch.io `Asset license` field (managore.itch.io/m5x7) | TTF | designer: "use font size **16, 32, 48**" |
| **m6x11 / m3x6** | Daniel Linssen | ❌ **FAIL** — itch pages carry **no `Asset license` field**, only body text "free to use with attribution". Not an SPDX license. *m5x7 is fine; the same-designer assumption bites here.* | — | — |
| **Cozette** | Samhain / slavfox (repo moved to `the-moonwitch/Cozette`) | ✅ **MIT** — LICENSE file | ✅ v1.30.0 ships `CozetteVector.woff2` | **6×13 px** box, 8 px cap height |
| **Terminus** | Dimitar Zhekov | ✅ **OFL-1.1** — official changelog v4.40 "Changed the font license to SIL OFL 1.1" | ⚠️ upstream is **bitmap only** (bdf/pcf); web TTF is a separate project (Blumenbach), OFL only from v4.32 | 6×12 → 16×32; hardware-terminal lineage, **not** a contemporary display face |
| **monogram** | datagoblin | ✅ **CC0-1.0** — itch `Asset license` field | TTF / bitmap / PICO-8 | compact monospace bitmap |
| **Grand9K Pixel** | Jayvee Enaguas | ❌ **FAIL — CC BY-SA 3.0** (share-alike), and derived from a Minecraft texture pack (secondary IP risk) | — | 8 px |
| **"Nice Pixel"** | — | ⚠️ **unverified — no such font located.** Probably meant **Ark Pixel** (TakWolf) → ✅ **OFL-1.1** font / MIT tools, pan-CJK, 8/10/12/16 px | ✅ woff2 | — |

**Also verified OFL-1.1** (all from `google/fonts/ofl/*/METADATA.pb`, all served as woff2, most on `@fontsource@5.3.0` alongside the Noto packages this repo already uses):
**Pixelify Sans** · **Jersey 10/15/25** · **Micro 5** · **Tiny5** · **Press Start 2P** · **VT323** · **DotGothic16**, plus **Public Pixel** (CC0, ggbot.itch.io).

> **The two variable pixel fonts are the sharpest "modern but oldschool" artifacts in the whole survey:**
> **Handjet** (Rosetta / David Březina, OFL) has custom axes **`ELGR` 1–2 (element grid)** and **`ELSH` 0–16 (element shape)** plus `wght` 100–900;
> **Sixtyfour** and **Workbench** (Jens Kutílek, OFL) have **`BLED` 0–100** and **`SCAN` −53–100** — parametric CRT bleed and scanline.
> Retro output, contemporary font format. (`https://fonts.google.com/metadata/fonts`, verified)

### 5b. Modern-retro CSS/UI kits (98.css / NES.css / system.css already known, all MIT)

The useful axis is **period reproduction** (imitates one historical OS chrome) vs **modern-retro** (retro flavour, contemporary layout and a11y).

- **Period reproduction** (same failure mode as the rejected register): 7.css (MIT, Win7 Aero), XP.css (MIT, Win XP Luna), PSone.css (MIT, PS1 menu UI). **Hybrid:** BOOTSTRA.386 (Apache-2.0) — DOS/CGA skin over a real Bootstrap grid.
- **Modern-retro (the relevant family):** **8bitcn/ui** (MIT, 8bitcn.com) — shadcn/ui fork with 8-bit styling that **keeps the Radix a11y primitives**, best-in-class here; **RetroUI** (BSD-3-Clause, retroui.io — attribution clause differs from MIT); **snes.css**, **terminal.css**, **Hack/hackcss**, **retro-react**, **neobrutalism components** (all MIT).
- ❌ **No license file → fail:** TheSims.css, `maomentai817/pixel-ui`, 8.bit-css. **`zshall/shell-css` = NOASSERTION.**
- **Nine-slice:** no maintained permissive 9-patch CSS library worth a dependency. Native route is `border-image` + `border-image-slice` + `border-image-repeat: round` with `image-rendering: pixelated` — plain CSS, no license attached.

### 5c. Colour scheme collections — **all seven pass**

**Catppuccin** MIT (`catppuccin/catppuccin`, palette pkg also MIT) · **Tokyo Night** MIT (`tokyo-night/tokyo-night-vscode-theme`; the popular `folke/tokyonight.nvim` port is **Apache-2.0** — also fine, different terms) ·
**Nord** MIT (cite `develop/license`; the stale `master` branch still carries Apache-2.0) · **Rosé Pine** MIT · **Everforest** MIT · **Kanagawa** MIT ·
**Gruvbox** ⚠️ README declares "MIT/X11" but `morhetz/gruvbox` **has no LICENSE file** — weakest paper trail; use `ellisonleao/gruvbox.nvim` (real MIT) if a clean file is needed.

⚠️ **Lospec palettes: no license statement found** on the palette list or About page (lospec.com/palette-list, lospec.com/about) — *unverified*, do not vendor wholesale. The seven above are the safe route, and Omarchy demonstrates the pattern of shipping many of them at once.

---
## 6. What this means for mdcovergen

**The register, in one line:** *grid geometry in one deliberate place, contemporary technique everywhere else, and no skeuomorphism
at all.* Both references agree; they just put the grid in different places — Omarchy in **the mark** (grid wordmark, 1-bit favicon)
with smooth bezier icons and a plain-sans docs site; the games in **the content**, with a smooth vector mark (11/15).

**Consequences for a J-card generator:**

1. **Do not set the app's own wordmark in a pixel font.** That is the pastiche move and 11 of 15 shipped titles avoid it.
   If the mark is to be grid-built, build it *specifically* — Omarchy's `logo.svg` (81 × 19 cells, `m h v l z` only, no curves)
   is the exact template, and it costs one hand-drawn SVG, not a font dependency.
2. **The 1-bit, 2-colour, hard-edged, coarse-grid favicon is the highest-value single idea here** and it is nearly free:
   Omarchy's is a 15 × 15 module glyph. It is the one asset that must survive 16 px, and grid construction is *why* it does.
3. **Bitmap fonts in the printed output hit a hard floor.** Using `oldschool-registers.md`'s constants (300 dpi = 11.811 px/mm; Sony
   DADC min line width **0.15 mm**, min character size **5 pt**, recommended **7 pt**): 1 device px = **0.0847 mm → FAILS** the
   0.15 mm stroke minimum, so **a bitmap font at 1× is not printable at J-card size**; 2 px = 0.1693 mm ✓, 3 px = 0.2540 mm ✓.
   5 pt = **20.83 device px**, 7 pt = **29.17 device px** → an **8 px-em** face needs **≥3×** to clear 5 pt (4× for 7 pt); a
   **16 px-em** face needs **≥2×**. Designers say the same thing independently: m5x7 "use font size 16, 32, 48", Departure Mono
   "increments of 11px", and Medeiros' "never at 150%" (§2). **Pixel type is viable for headline/spine only, never for tracklists** —
   body copy stays a smooth outline face, and the repo already ships Noto Sans Variable + Noto Sans JP via `@fontsource`.
4. **If a pixel face is adopted, prefer a variable one** (§5: Handjet's `ELGR`/`ELSH`, Sixtyfour/Workbench's `BLED`/`SCAN`) — retro
   output in a contemporary font format is the literal artifact the brief asks for.
5. **Adopt a named palette rather than inventing one.** Omarchy's model — one small colour contract, many swappable named themes —
   maps directly onto a cover generator, and all seven collections in §5c are permissively licensed.

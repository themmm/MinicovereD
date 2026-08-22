# The Mark is a J-Card, hinged, on sixteen modules

The Mark is **the Spine dropped two modules beside the Front Panel** — a J-Card
seen flat-on with its fold showing — drawn once by hand on a sixteen-module grid
in two colours, with no curve and no anti-aliasing.

```
················    M2 4h2v10H2z    the Spine,       2 × 10, dropped 2
················    M5 2h9v10H5z    the Front Panel, 9 × 10
·····█████████··
·····█████████··    Bounding box 12 × 12, centred, so every surface has a
··██·█████████··    margin and the maskable icon has room inside its circle.
··██·█████████··
··██·█████████··
··██·█████████··
··██·█████████··
··██·█████████··
··██·█████████··
··██·█████████··
··██············
··██············
················
················
```

ADR-0008 asked for grid geometry in exactly one layer and named that layer the
Mark; ADR-0009 named the project and then spent its one Sony reference on the
name, which left this ADR with the job of not spending it again. What ships
today is `assets/logo.svg`: a MiniDisc cartridge, shutter slot and all, with the
diagonal corner, drawn large with `Q` curves and rounded corners in a slate and
amber palette that is not Everforest. ADR-0009 already records it as the
discarded old mark. It breaks rules 1, 2, 3 and 5 and the sub-brand resolution
at once, so replacing it is the ticket rather than polish.

## What the constraints actually removed

The prohibitions are short and they eliminate most of the obvious answers.

**The notch is out, and this is the one that is easy to get wrong.** The Label
is "rectangular, with one diagonally cut corner" (CONTEXT.md) and a notched
square is the most legible 16 px figure in this whole domain. But the Label's
corner is clipped *to clear the cartridge's* corner, so a notched square is a
figure derived from the cassette — and, worse, it is the incumbent mark with the
detail sanded off, which would read as a simplification of a rejected drawing
rather than a departure from it.

**Uniform construction, not solid against hollow.** ADR-0008's sub-brand
paragraph forbids "a solid/hollow contrast" because that is the MiniDisc logo's
own mechanism. Read narrowly it forbids solid initials among hollow letters;
read at all carefully it forbids a composition whose point is that one element
is filled and the rest are outlined, which is the same mechanism transposed. So
every element here is one ink at one weight. This also happens to be what
survives 16 px.

## Four rounds, and what each one killed

Every candidate was built, screenshotted at 16, 19, 32, 48, 192 and 512, placed
in a mock header and a mock browser tab, and rasterised at 16 × 16 and magnified
with no smoothing — because 16 px is the size the whole grid construction exists
for, and it is not a size you can judge from a large drawing.

**Round one, five figures, and the finding that shaped the rest: every simple
sixteen-module figure collides with something already in the icon vocabulary.**
Four spines of differing heights read as an equaliser. A Spine with three type
rules beside it read as text-align. Two offset rectangles read as
copy-to-clipboard. Four corner brackets read as fullscreen. The one that
collided with nothing — the J-Card unfolded into flap, Spine and Front Panel at
its true 14 : 5.5 : 68 — dissolved at 16 px, because it spent two of its
fourteen modules on gutters and one on the Spine.

**Round two** traded elements for coarseness. Bars with one lifted out still read
as a chart. Bin-packed rectangles read as the stock layout icon. A Spine beside a
Front Panel, flush, read as a sidebar. Two survived: the hinged pair, and a
J-Card beside a Label at their true relative size.

**Round three** added the one figure the earlier rounds kept arguing for: the
J-Card's cross-section, which is a squared **J** and is where the name J-Card
comes from. It is the most memorable thing drawn in four rounds and it is
rejected, because it reads as a letter and J is not a letter in MinicovereD.
After 0009 took such care over the M/D device, smuggling in a different initial
would be worse than the device it avoided.

**Round four** settled the geometry: gutter 1, drop 2, bounding box 12 × 12
centred. A two-module gutter is wider than the Spine and reads as a mistake; a
four-module drop empties the corners and the figure reads as a diagonal; a
three-module Spine is heavier at 16 px and four times too wide.

Rejected outright and not drawn: anything with a MiniDisc in it, and the three
Parts at their true relative sizes — a J-Card is 73.5 × 79 and a Back Card
69 × 79, which at sixteen modules are the same square.

## The one place the drawing is not true to the millimetre

The Front Panel is 9 × 10 modules for 68 × 79 mm, which is right to within 4 %.
The Spine is **2 modules where true scale is 0.73** — nearly three times too
wide. One module is one pixel at 16 px, and a one-pixel sliver beside a
nine-pixel panel is what killed the flat J-Card in round one. The Mark is a mark
and not a diagram, the deviation is in the one dimension a reader cannot check,
and this paragraph is the record that it was chosen rather than missed.

## Mark and Icon are two files, because CONTEXT.md already says they are two things

The glossary separates them: the **Mark** is the pictorial mark, an **Icon** is
"a rendered placement of the Mark at a fixed pixel size — favicon, app icon,
maskable icon. Not the Mark itself."

That separation turns out to be load-bearing rather than pedantic. Measured on a
mock tab strip: the bare Mark is ink, and ink on a dark browser tab bar is very
nearly nothing. On a ground it holds on both. So:

- **`assets/mark.svg`** — the figure alone, `#5c6a72` on nothing. The header, the
  README at 96 px (× 6).
- **`assets/icon.svg`** — the same figure in `#fdf6e3` on a full `#5c6a72` field.
  The favicon, and the source the three PNGs are rasterised from.

The figure is therefore written down twice, and nothing in SVG or TypeScript
notices when two path strings drift apart. `src/app/mark.test.ts` does, and also
holds the grid: sixteen modules, `M H V Z` only, and the two palette colours.

An ink-filled tile in the header was tried and rejected — beside About and the
search field it reads as a button in a row of buttons.

## The header goes from 19 px to 16

**19 px is not an integer multiple of any grid that also divides 192 and 512.**
Only 1 and 19 divide 19. At 19 px a sixteen-module figure is 1.1875 modules to
the pixel, and the edges soften — visibly, side by side — which is precisely
what rule 5 forbids and what rule 2's whole construction exists to prevent.

16 px is × 1. It is also the same rendering as the favicon, which is a small
virtue on its own. The other integer option, 32 px, is × 2 and much more present,
but ADR-0010 records that a 34 px logo is what made a permanent search field
impossible in a 68 px row, and walking that back for three pixels of mark is the
wrong trade. The row stays 68 px either way.

Every surface is now an integer multiple:

| Surface | Size | Scale |
| --- | --- | --- |
| header, favicon | 16 | × 1 |
| README | 96 | × 6 |
| `icon-192.png` | 192 | × 12 |
| `icon-512.png` | 512 | × 32 |
| `icon-maskable-512.png` | figure at 288 on a 512 field | × 18 |

The maskable icon's safe zone is a circle of 40 % radius — 204.8 px of 512 — so
the figure's bounding box has to fit inside it. At × 18 the Mark's 12 × 12
bounding box is 216 px across and its half-diagonal is 153. The full sixteen
module field at × 18 is 288 with a half-diagonal of 204, which also fits; 18 was
chosen as the largest comfortable integer rather than the largest possible one.

The PNGs are drawn as a path into a canvas at those integer scales rather than
by resampling a bitmap, so every edge lands on a device pixel.

## Consequences

Five places move together, and they are the five ADR-0009 left open:
`src/app/shell.ts` (the header at 16, and the favicon, which is the Icon now and
not the Mark), `README.md`, `src/attribution/attributions.ts` — `OWN_ARTWORK`
claims `mark.svg` and `icon.svg` where it claimed `logo.svg` — and the three
PNGs under `public/icons`. `assets/logo.svg` is deleted; nothing referenced it
afterwards.

The Wordmark is untouched and stays ordinary capitals set in type (ADR-0008's
sub-brand paragraph), so that paragraph needs no follow-up. Rule 8 is untouched:
the Mark is on screen and in the repository, and on no Part.

Not done, and deliberately: the Mark does not appear in the about dialog, though
ADR-0008 lists it as a place the Mark lives. The dialog is a licence and
attribution surface and has no image slot; adding one is a design change to a
surface this ticket has no other business in.

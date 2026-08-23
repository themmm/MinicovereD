import type { PaperSize } from '../domain/paper.ts';
import type { Rect, Size } from '../domain/units.ts';
import type { PartPlacement, SheetLayout } from './layout.ts';

/**
 * One Part, as a Sheet of its own size.
 *
 * ADR-0010 makes the Part the design surface, and this is the whole of what
 * that costs the renderer: nothing. A Part is drawn by the same `rasterizeSheet`
 * call the A4 Sheet goes through, given a layout whose paper *is* the Part, so
 * "what you see is what you get" holds for the specimen for the same reason it
 * holds for the Sheet — there is only one drawing path.
 *
 * The Part keeps its guides. That is deliberate rather than convenient:
 * `drawPlacement` clips a Part's drawing to its cut outline, so a Label shown
 * without its outline would fill the notched corner the cartridge does not
 * have. The specimen is a true crop of what prints, cut line included — which
 * at `#8a8a8a` on paper is 3.45:1 and is the hairline ADR-0010 asks for.
 */

/**
 * How a J-Card is shown. `flat` is the 87.5 mm strip that prints; `assembled`
 * is what sits in the case — Front Panel face-on with the Spine beside it and
 * the Inner Flap folded away behind (ADR-0010).
 *
 * Only the J-Card folds, so only the J-Card has two of these.
 */
export type JCardView = 'assembled' | 'flat';

/**
 * Negation that cannot produce a signed zero.
 *
 * `-0` is a coordinate no geometry means, and it survives into layouts,
 * comparisons and snapshots — `Object.is(-0, 0)` is false — so it is worth not
 * having at the one place it can be produced.
 */
const negate = (value: number): number => (value === 0 ? 0 : -value);

/**
 * The Part's own size, standing up — its packed box with any turn undone.
 *
 * A Part packed on its side (ADR-0014) is still a Part of the size it was
 * designed at, and everything on this side of the app is about the Part: the
 * specimen, its caption, and the `--w` and `--h` the band hands to CSS.
 */
function uprightSize(placement: PartPlacement): Size {
  const { width, height } = placement.bounds;
  return placement.turned ? { width: height, height: width } : { width, height };
}

/** The union of `rects`, or undefined if there are none. */
function union(rects: readonly Rect[]): Rect | undefined {
  const [first, ...rest] = rects;
  if (!first) return undefined;
  return rest.reduce((box, rect) => {
    const x = Math.min(box.x, rect.x);
    const y = Math.min(box.y, rect.y);
    return {
      x,
      y,
      width: Math.max(box.x + box.width, rect.x + rect.width) - x,
      height: Math.max(box.y + box.height, rect.y + rect.height) - y,
    };
  }, first);
}

/**
 * The part of a Part that is on screen, in Part-local millimetres.
 *
 * Assembled means the Inner Flap is behind the Front Panel and cannot be seen,
 * so the box is what the other panels occupy. Taken as their union rather than
 * by arithmetic on the flap's width, so it stays right if the panel order ever
 * changes — and it falls back to the whole Part whenever there are no panels to
 * reason about, which is every Part except the J-Card.
 */
export function visibleBox(placement: PartPlacement, view: JCardView): Rect {
  const whole: Rect = { x: 0, y: 0, ...uprightSize(placement) };
  if (view === 'flat' || !placement.panels) return whole;

  const shown = placement.panels.filter((panel) => panel.panel !== 'inner-flap');
  return union(shown.map((panel) => panel.rect)) ?? whole;
}

/**
 * A layout holding `placement` alone, on paper trimmed to what `view` shows.
 *
 * The placement is moved by the negative of the visible box, so anything hidden
 * falls off the canvas and is clipped by it — no drawing code needs to know
 * that a panel is folded away.
 *
 * `paper` carries the id and the name of the Sheet the Part was packed on,
 * because `SheetLayout` asks for a `PaperSize` and inventing one would put a
 * paper in the model that no printer has. Only the width and height are this
 * function's own, and they are all the rasteriser reads. The honest shape would
 * be `Size & { name }` on `SheetLayout.paper`; changing it would reach into the
 * renderer, which ADR-0010 keeps out of scope.
 */
export function partSheet(
  paper: PaperSize,
  placement: PartPlacement,
  view: JCardView = 'flat',
): SheetLayout {
  const box = visibleBox(placement, view);
  return {
    paper: { ...paper, width: box.width, height: box.height },
    marginMm: 0,
    placements: [
      {
        ...placement,
        // A Part that was *packed* turned is still designed standing up. The
        // specimen and the 1:1 view are the design surface (ADR-0010), and the
        // collector never chose the turn — it is an answer to the size of the
        // paper, and it belongs to the Sheet check where the paper is.
        turned: false,
        bounds: { x: negate(box.x), y: negate(box.y), width: box.width, height: box.height },
      },
    ],
  };
}

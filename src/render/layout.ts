import type { PartKind } from '../domain/parts.ts';
import type { PaperSize } from '../domain/paper.ts';
import type { Mm, Point, Rect } from '../domain/units.ts';

/**
 * The layout model: what a Sheet contains, in millimetres, before anything is
 * drawn. Rasterising and PDF export are two readers of this same model, which
 * is why the live preview and the exported page cannot drift apart — and why
 * the geometry can be asserted as data rather than as pixels.
 */

/**
 * One of the bundled print faces, named rather than spelled out.
 *
 * The layout model says *which* face; `PRINT_FONT_STACKS` in `raster.ts` is the
 * only thing that knows what string a canvas is given for it (ADR-0008 rule 9).
 * Splitting it this way is what lets a Template choose a face without any
 * Template holding a font stack — and a name cannot drift from a stylesheet the
 * way a copied stack can.
 *
 * The ids are voices rather than families, because that is what a Template is
 * picking: `serif` is "the book one" and stays that whichever face fills it.
 */
export type PrintFace = 'sans' | 'serif' | 'slab' | 'grotesque' | 'condensed' | 'humanist';

export interface TextStyle {
  readonly sizeMm: Mm;
  readonly weight: 400 | 600 | 700;
  /**
   * Required, and deliberately not defaulted: a forgotten face would fall
   * silently back to the neutral sans, which is exactly the "declared and
   * ignored" failure a per-Template stack can ship. Being part of the style is
   * also what keeps measuring and drawing on the same face — both read this.
   */
  readonly face: PrintFace;
  readonly color: string;
  readonly align: 'left' | 'center' | 'right';
  /** Vertical anchor of `at.y`. `top` is the ascender line, `middle` the visual centre. */
  readonly baseline: 'top' | 'middle';
  /** Rotation about `at`, clockwise. Used for the Spine, which reads along the case edge. */
  readonly rotationDeg?: -90 | 0 | 90;
}

/**
 * Anything drawable from a data URL at a known intrinsic size — cover art, or
 * the bundled MiniDisc logo. `Artwork` satisfies it structurally.
 */
export interface ImageSource {
  readonly dataUrl: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export type DrawOp =
  | { readonly op: 'fill-rect'; readonly rect: Rect; readonly color: string }
  | { readonly op: 'fill-polygon'; readonly points: readonly Point[]; readonly color: string }
  | { readonly op: 'line'; readonly from: Point; readonly to: Point; readonly color: string; readonly widthMm: Mm }
  | {
      readonly op: 'image';
      readonly rect: Rect;
      readonly source: ImageSource;
      /** `cover` fills the rect and crops; `contain` fits inside it. */
      readonly fit: 'cover' | 'contain';
      /** What this image is, so a Sheet can be inspected without decoding it. */
      readonly role: 'artwork' | 'logo';
      /** Rotation about the rect's centre, clockwise. The Spine reads sideways. */
      readonly rotationDeg?: -90 | 0 | 90;
    }
  | TextOp;

/**
 * Named apart from the rest of the union because a caller sometimes needs the
 * string that actually went onto the Part — `ellipsise` may have shortened it,
 * and the Spine reports when it did.
 */
export type TextOp = {
  readonly op: 'text';
  readonly text: string;
  readonly at: Point;
  readonly style: TextStyle;
};

/**
 * What a fold in the paper is for, and therefore which way it goes.
 *
 * Single-sided printing fixes the whole pattern (ADR-0012): a face is only ever
 * visible if the printed side points outward, so the paper has to double back
 * blank against blank, which makes every leaf two Pages thick.
 *
 *  - `case` — the two folds that wrap the case: the Spine around its edge and
 *    the Inner Flap in behind. The J-Card's own two folds, unchanged.
 *  - `fore-edge` — **blank meets blank**, folded away from the printed side.
 *    Where a leaf doubles back on itself.
 *  - `spine` — **printed meets printed**, folded toward the printed side. The
 *    booklet's hinge, and the one fold that goes the other way: open the cover
 *    and the two Pages either side of it face you as a spread.
 *
 * Three kinds rather than one, because a collector folding the wrong one the
 * wrong way gets a booklet with a blank face showing, and the printed Sheet is
 * the only instruction they have.
 */
export type FoldKind = 'case' | 'fore-edge' | 'spine';

/** A print-only mark showing where to cut (CONTEXT.md: Cutting Guide). */
export interface CutGuide {
  readonly kind: 'cut';
  /** Polyline in Part-local coordinates. A cut guide for a Part is its closed outline. */
  readonly points: readonly Point[];
  readonly closed: boolean;
}

/** A print-only mark showing where — and which way — to fold. */
export interface FoldGuide {
  readonly kind: 'fold';
  readonly fold: FoldKind;
  readonly points: readonly Point[];
  readonly closed: boolean;
}

/**
 * A cut or fold mark. A union rather than one shape with an optional field,
 * because `fold` means nothing on a cut line and a cut line with a fold kind on
 * it is a mark nobody could draw.
 */
export type Guide = CutGuide | FoldGuide;

/**
 * What one Page of the Insert carries (ADR-0012).
 *
 * Part of the layout model rather than of the module that decides it, because
 * two sides read it: `insert-plan.ts`, which works out how many Pages a Release
 * needs and what goes where, and the Templates, which draw one Page at a time
 * and have to be told which.
 *
 * `artwork` is the odd Page out — the back cover a real booklet has, which
 * exists because the Page count is even and costs nothing because the image is
 * already embedded at full resolution.
 */
export type PageRole = 'cover' | 'tracklist' | 'credits' | 'artwork';

/**
 * One section of the Insert, in Part-local coordinates, so tests can assert the
 * fold pattern in millimetres.
 *
 * `page` carries its 1-based number because that is the only way to say which
 * Page a rectangle is, and the numbers are what the fold pattern is expressed
 * in. Page 1 *is* the Front Panel (ADR-0012), which is why there is no
 * `front-panel` member here any more.
 */
export type PanelBounds =
  | { readonly panel: 'inner-flap' | 'spine'; readonly rect: Rect }
  | {
      readonly panel: 'page';
      /** 1-based, counting along the flat strip. Page 1 is the Front Panel. */
      readonly page: number;
      readonly role: PageRole;
      readonly rect: Rect;
    };

export interface PartPlacement {
  readonly releaseId: string;
  readonly part: PartKind;
  /**
   * Where the Part sits on the Sheet, from the paper's top-left corner. A
   * turned Part's box is already swapped — 79 × 282.5 rather than 282.5 × 79 —
   * because this is what says how much paper the Part covers.
   */
  readonly bounds: Rect;
  /**
   * Packed on its side, 90° clockwise, because the Part is longer than the
   * paper is wide (ADR-0014: the Part turns, not the Sheet).
   *
   * Only `bounds` knows about it. `ops`, `guides` and `panels` stay in the
   * Part's own upright coordinates and are turned with it by whatever draws
   * them, which is what keeps a Template from ever having to ask which way up
   * its Part was packed — and what lets the design surface show the same Part
   * standing up (ADR-0010).
   *
   * Stated rather than optional: a Part drawn upright inside a turned box is
   * off the paper, and that is not a mistake worth making silently.
   */
  readonly turned: boolean;
  /** Drawing instructions in Part-local coordinates (origin = `bounds` top-left). */
  readonly ops: readonly DrawOp[];
  /** Cut and fold guides in Part-local coordinates. */
  readonly guides: readonly Guide[];
  /**
   * Present for the Insert: the Inner Flap, the Spine and every Page, in the
   * order they sit on the flat strip. Absent for the Label, which does not fold.
   */
  readonly panels?: readonly PanelBounds[];
}

export interface SheetLayout {
  readonly paper: PaperSize;
  readonly marginMm: Mm;
  readonly placements: readonly PartPlacement[];
  /**
   * Marks belonging to the Sheet rather than to any Part, in paper
   * coordinates. The calibration sheet is made entirely of these: nothing on it
   * is a Release, it is a ruler.
   */
  readonly ops?: readonly DrawOp[];
  readonly guides?: readonly Guide[];
  /**
   * Things the collector should know before printing. Structured rather than
   * prose, so the UI decides the wording and the geometry stays geometry.
   */
  readonly warnings?: readonly SheetWarning[];
}

/**
 * The tracklist had to shrink past the size a printer reliably holds. Every
 * track is still on the Part — this says they may not be readable.
 */
export interface TypeBelowPrintFloor {
  readonly kind: 'type-below-print-floor';
  readonly releaseId: string;
  /** What to call the Release on screen. */
  readonly releaseTitle: string;
  readonly trackCount: number;
  readonly sizeMm: Mm;
  readonly floorMm: Mm;
}

/**
 * The Spine's one line did not fit, and the end of it is not on the Part.
 *
 * The one warning here that reports *lost content* rather than small content.
 * The Spine is one line by design — a shelved case has to read as one thing —
 * so it cannot flow the way the tracklist does, and the type does not shrink
 * to buy room either (`SPINE_SIZE_MM` in `templates/shared.ts` says why). What
 * is left is to say plainly that the line was cut and what is on the Part
 * instead, so that a collector can shorten it themselves.
 */
export interface SpineTruncated {
  readonly kind: 'spine-truncated';
  readonly releaseId: string;
  /** What to call the Release on screen. */
  readonly releaseTitle: string;
  /** What the Spine was asked to say. */
  readonly line: string;
  /** What it says instead, ellipsis and all — the string that was drawn. */
  readonly shown: string;
  readonly sizeMm: Mm;
}

/**
 * The Insert folds into fewer Pages than this Release's content asked for, so
 * something the collector can see on screen is not on the paper.
 *
 * Two things cause it and the fields say which without naming it, because
 * wording is the UI's (see the note on {@link SheetLayout.warnings}). When
 * `maxPages` is below `requestedPages` the paper is the limit — a 282.5 mm strip
 * needs a printable margin of 7.25 mm or less on A4, and never fits Letter at
 * all. Otherwise the paper had room and the *content* could not fill the Pages:
 * ADR-0012's even-Page rule may not produce a blank sheet the collector did not
 * ask for, so a fourth Page nothing would go on is not folded.
 */
export interface InsertPagesShort {
  readonly kind: 'insert-pages-short';
  readonly releaseId: string;
  /** What to call the Release on screen. */
  readonly releaseTitle: string;
  /**
   * Pages that were asked for: the collector's own count when they set one,
   * otherwise the Release's content.
   *
   * The number the shortfall is measured against, and the number a sentence about
   * it has to quote — a collector who typed 4 into the Pages control is owed an
   * answer about 4 and not about what the content would have chosen.
   */
  readonly requestedPages: number;
  /** Whether it was the collector who asked, rather than the content. */
  readonly requestedByCollector: boolean;
  /** Pages the Insert actually folds into. */
  readonly pages: number;
  /** The most Pages this paper at this printable margin would take (ADR-0014). */
  readonly maxPages: number;
  readonly paperName: string;
  readonly marginMm: Mm;
  /**
   * What is not on the Insert as a result, in reading order. Never the tracklist.
   *
   * **Can be empty**, and that is a real case rather than a contradiction: a
   * collector who asks for four Pages on a Release with two Pages of content has
   * lost nothing, because there was nothing more to print. The strip is still
   * shorter than they asked for and the report still fires.
   */
  readonly dropped: readonly PageRole[];
}

export type SheetWarning = TypeBelowPrintFloor | SpineTruncated | InsertPagesShort;

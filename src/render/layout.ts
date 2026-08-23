import type { JCardPanel, PartKind } from '../domain/parts.ts';
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

/** A print-only mark showing where to cut or fold (CONTEXT.md: Cutting Guide). */
export interface Guide {
  readonly kind: 'cut' | 'fold';
  /** Polyline in Part-local coordinates. A cut guide for a Part is its closed outline. */
  readonly points: readonly Point[];
  readonly closed: boolean;
}

/** One panel of the J-Card, in Part-local coordinates, so tests can assert the fold pattern. */
export interface PanelBounds {
  readonly panel: JCardPanel;
  readonly rect: Rect;
}

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
  /** Present for the J-Card: the three panels it folds into. */
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

export type SheetWarning = TypeBelowPrintFloor | SpineTruncated;

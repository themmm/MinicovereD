import type { Artwork } from '../domain/release.ts';
import type { JCardPanel, PartKind } from '../domain/parts.ts';
import type { PaperSize } from '../domain/paper.ts';
import type { Mm, Point, Rect } from '../domain/units.ts';

/**
 * The layout model: what a Sheet contains, in millimetres, before anything is
 * drawn. Rasterising and PDF export are two readers of this same model, which
 * is why the live preview and the exported page cannot drift apart — and why
 * the geometry can be asserted as data rather than as pixels.
 */

export interface TextStyle {
  readonly sizeMm: Mm;
  readonly weight: 400 | 600 | 700;
  readonly color: string;
  readonly align: 'left' | 'center' | 'right';
  /** Vertical anchor of `at.y`. `top` is the ascender line, `middle` the visual centre. */
  readonly baseline: 'top' | 'middle';
  /** Rotation about `at`, clockwise. Used for the Spine, which reads along the case edge. */
  readonly rotationDeg?: -90 | 0 | 90;
  /** Squeeze the glyphs horizontally to this width rather than overflow. */
  readonly maxWidthMm?: Mm;
}

export type DrawOp =
  | { readonly op: 'fill-rect'; readonly rect: Rect; readonly color: string }
  | { readonly op: 'fill-polygon'; readonly points: readonly Point[]; readonly color: string }
  | { readonly op: 'line'; readonly from: Point; readonly to: Point; readonly color: string; readonly widthMm: Mm }
  | {
      readonly op: 'image';
      readonly rect: Rect;
      readonly artwork: Artwork;
      /** `cover` fills the rect and crops; `contain` fits inside it. */
      readonly fit: 'cover' | 'contain';
    }
  | { readonly op: 'text'; readonly text: string; readonly at: Point; readonly style: TextStyle };

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
  /** Where the Part sits on the Sheet, from the paper's top-left corner. */
  readonly bounds: Rect;
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
}

/** The area of a Sheet that may carry content — the paper minus the printable margin. */
export function printableArea(paper: PaperSize, marginMm: Mm): Rect {
  return {
    x: marginMm,
    y: marginMm,
    width: paper.width - 2 * marginMm,
    height: paper.height - 2 * marginMm,
  };
}

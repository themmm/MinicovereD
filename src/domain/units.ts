/**
 * Every length in mdcovergen is a millimetre. The physical Parts are specified
 * in mm (ADR-0005), the PDF is placed in mm, and the only conversions that
 * exist are the two below — to raster pixels and to PDF points.
 */
export type Mm = number;

export interface Point {
  readonly x: Mm;
  readonly y: Mm;
}

export interface Size {
  readonly width: Mm;
  readonly height: Mm;
}

/** Axis-aligned box; `x`/`y` are the top-left corner, y growing downwards. */
export interface Rect extends Point, Size {}

const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

/** Raster pixels per millimetre at `dpi`. Exact — this is the drawing scale. */
export function pxPerMm(dpi: number): number {
  return dpi / MM_PER_INCH;
}

/** Raster pixels covering `mm` at `dpi`, rounded to a whole pixel. */
export function mmToPx(mm: Mm, dpi: number): number {
  return Math.round(mm * pxPerMm(dpi));
}

/** PDF user-space points covering `mm`. Not rounded: the PDF page must be exact. */
export function mmToPt(mm: Mm): number {
  return (mm * PT_PER_INCH) / MM_PER_INCH;
}

export function ptToMm(pt: number): Mm {
  return (pt * MM_PER_INCH) / PT_PER_INCH;
}

/** Pixel dimensions of a surface of `size` rasterised at `dpi`. */
export function rasterSizePx(size: Size, dpi: number): { readonly width: number; readonly height: number } {
  return { width: mmToPx(size.width, dpi), height: mmToPx(size.height, dpi) };
}

export function rectRight(rect: Rect): Mm {
  return rect.x + rect.width;
}

export function rectBottom(rect: Rect): Mm {
  return rect.y + rect.height;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < rectRight(b) && b.x < rectRight(a) && a.y < rectBottom(b) && b.y < rectBottom(a);
}

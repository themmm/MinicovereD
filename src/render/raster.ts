import type { Artwork } from '../domain/release.ts';
import type { Mm, Point, Rect } from '../domain/units.ts';
import { pxPerMm, rasterSizePx } from '../domain/units.ts';
import { fitImage } from './image-fit.ts';
import type { DrawOp, Guide, PartPlacement, SheetLayout, TextStyle } from './layout.ts';

/**
 * Draws a Sheet layout onto a canvas. This is the one place that knows about
 * pixels, and it is deliberately a dumb interpreter of the layout model: the
 * live preview and the 300 DPI export call it with different DPI and nothing
 * else, which is why what you see is what you get.
 */

/** Print resolution of the exported PDF (spec: 300 DPI output). */
export const EXPORT_DPI = 300;

/** Cut and fold marks, thin but above Sony's 0.15 mm printable-line floor. */
const GUIDE_WIDTH_MM: Mm = 0.15;
const GUIDE_COLOR = '#8a8a8a';
/**
 * A fold guide runs along a panel boundary, where a dark Spine would swallow a
 * grey hairline. Laying the mark over a wider light stroke keeps it readable on
 * any background — and unlike ticks reaching past the Part, it stays inside the
 * printable margin.
 */
const GUIDE_HALO_COLOR = '#ffffff';
const GUIDE_HALO_WIDTH_MM: Mm = 0.5;
const FOLD_DASH_MM: readonly [Mm, Mm] = [1.6, 1.2];

export const FONT_STACK = "'Noto Sans Variable', 'Noto Sans JP', system-ui, sans-serif";

export function fontFor(style: TextStyle, scale: number): string {
  return `${style.weight} ${style.sizeMm * scale}px ${FONT_STACK}`;
}

/**
 * The part of the browser's 2D context this module uses. Naming the boundary
 * keeps the mm-to-pixel arithmetic testable without a canvas — a real
 * `CanvasRenderingContext2D` satisfies it structurally.
 */
export interface Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: readonly number[]): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

/** Everything drawing needs beyond the ops themselves. */
interface Surface {
  readonly context: Canvas2D;
  /** Raster pixels per millimetre. */
  readonly scale: number;
  readonly images: ReadonlyMap<string, CanvasImageSource>;
}

function tracePath(surface: Surface, points: readonly Point[], closed: boolean): void {
  const { context, scale } = surface;
  context.beginPath();
  points.forEach((point, index) => {
    const x = point.x * scale;
    const y = point.y * scale;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (closed) context.closePath();
}

function drawText(surface: Surface, op: Extract<DrawOp, { op: 'text' }>): void {
  const { context, scale } = surface;
  const { style } = op;
  context.save();
  context.translate(op.at.x * scale, op.at.y * scale);
  if (style.rotationDeg) context.rotate((style.rotationDeg * Math.PI) / 180);
  context.font = fontFor(style, scale);
  context.fillStyle = style.color;
  context.textAlign = style.align;
  context.textBaseline = style.baseline === 'top' ? 'top' : 'middle';
  context.fillText(op.text, 0, 0);
  context.restore();
}

function drawArtwork(surface: Surface, rect: Rect, artwork: Artwork, fit: 'cover' | 'contain'): void {
  const image = surface.images.get(artwork.dataUrl);
  if (!image) return;
  const { source, dest } = fitImage(artwork, rect, fit);
  surface.context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    dest.x * surface.scale,
    dest.y * surface.scale,
    dest.width * surface.scale,
    dest.height * surface.scale,
  );
}

function drawOp(surface: Surface, op: DrawOp): void {
  const { context, scale } = surface;
  switch (op.op) {
    case 'fill-rect':
      context.fillStyle = op.color;
      context.fillRect(op.rect.x * scale, op.rect.y * scale, op.rect.width * scale, op.rect.height * scale);
      return;
    case 'fill-polygon':
      context.fillStyle = op.color;
      tracePath(surface, op.points, true);
      context.fill();
      return;
    case 'line':
      context.strokeStyle = op.color;
      context.lineWidth = Math.max(1, op.widthMm * scale);
      tracePath(surface, [op.from, op.to], false);
      context.stroke();
      return;
    case 'image':
      drawArtwork(surface, op.rect, op.artwork, op.fit);
      return;
    case 'text':
      drawText(surface, op);
      return;
  }
}

function drawGuide(surface: Surface, guide: Guide): void {
  const { context, scale } = surface;
  context.save();
  // Hairlines below one device pixel would disappear entirely, so they are
  // clamped: a guide that cannot be seen cannot be cut along.
  if (guide.kind === 'fold') {
    context.strokeStyle = GUIDE_HALO_COLOR;
    context.lineWidth = Math.max(1, GUIDE_HALO_WIDTH_MM * scale);
    context.setLineDash([]);
    tracePath(surface, guide.points, guide.closed);
    context.stroke();
  }
  context.strokeStyle = GUIDE_COLOR;
  context.lineWidth = Math.max(1, GUIDE_WIDTH_MM * scale);
  context.setLineDash(guide.kind === 'fold' ? FOLD_DASH_MM.map((mm) => mm * scale) : []);
  tracePath(surface, guide.points, guide.closed);
  context.stroke();
  context.restore();
}

function drawPlacement(surface: Surface, placement: PartPlacement): void {
  const { context, scale } = surface;
  context.save();
  context.translate(placement.bounds.x * scale, placement.bounds.y * scale);

  // Nothing a Template draws may leave the Part: an overlong tracklist has to
  // spill inside the Back Card, not onto the Sheet around it.
  const outline = placement.guides.find((guide) => guide.kind === 'cut');
  context.save();
  if (outline) {
    tracePath(surface, outline.points, true);
    context.clip();
  }
  for (const op of placement.ops) drawOp(surface, op);
  context.restore();

  for (const guide of placement.guides) drawGuide(surface, guide);
  context.restore();
}

/** Draws every Part of `layout` onto `context`, in millimetres scaled to `dpi`. */
export function drawSheet(
  context: Canvas2D,
  layout: SheetLayout,
  dpi: number,
  images: ReadonlyMap<string, CanvasImageSource> = new Map(),
): void {
  const surface: Surface = { context, scale: pxPerMm(dpi), images };
  const { width, height } = rasterSizePx(layout.paper, dpi);

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  for (const placement of layout.placements) drawPlacement(surface, placement);
}

async function decodeArtwork(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

async function decodeAll(layout: SheetLayout): Promise<Map<string, CanvasImageSource>> {
  const urls = new Set<string>();
  for (const placement of layout.placements) {
    for (const op of placement.ops) if (op.op === 'image') urls.add(op.artwork.dataUrl);
  }
  const entries = await Promise.all(
    [...urls].map(async (url) => [url, await decodeArtwork(url)] as const),
  );
  return new Map(entries);
}

/** Renders `layout` onto a fresh canvas sized for `dpi`. */
export async function rasterizeSheet(layout: SheetLayout, dpi: number): Promise<HTMLCanvasElement> {
  const { width, height } = rasterSizePx(layout.paper, dpi);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('mdcovergen: this browser has no 2D canvas context');

  drawSheet(context, layout, dpi, await decodeAll(layout));
  return canvas;
}

export async function sheetToPng(layout: SheetLayout, dpi: number): Promise<Uint8Array> {
  const canvas = await rasterizeSheet(layout, dpi);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('mdcovergen: the browser could not encode the Sheet as PNG');
  return new Uint8Array(await blob.arrayBuffer());
}

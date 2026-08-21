import type { Artwork } from '../domain/release.ts';
import type { Mm, Point } from '../domain/units.ts';
import { mmToPx, rasterSizePx } from '../domain/units.ts';
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
const GUIDE_COLOR = '#9a9a9a';
const FOLD_DASH_MM: readonly [Mm, Mm] = [1.6, 1.2];

export const FONT_STACK = "'Noto Sans Variable', 'Noto Sans JP', system-ui, sans-serif";

export function fontFor(style: TextStyle, pxPerMm: number): string {
  return `${style.weight} ${style.sizeMm * pxPerMm}px ${FONT_STACK}`;
}

async function decodeArtwork(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

async function decodeAll(layout: SheetLayout): Promise<Map<string, HTMLImageElement>> {
  const urls = new Set<string>();
  for (const placement of layout.placements) {
    for (const op of placement.ops) if (op.op === 'image') urls.add(op.artwork.dataUrl);
  }
  const entries = await Promise.all(
    [...urls].map(async (url) => [url, await decodeArtwork(url)] as const),
  );
  return new Map(entries);
}

function tracePath(context: CanvasRenderingContext2D, points: readonly Point[], scale: number, closed: boolean): void {
  context.beginPath();
  points.forEach((point, index) => {
    const x = point.x * scale;
    const y = point.y * scale;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (closed) context.closePath();
}

function drawText(context: CanvasRenderingContext2D, op: Extract<DrawOp, { op: 'text' }>, scale: number): void {
  const { style } = op;
  context.save();
  context.translate(op.at.x * scale, op.at.y * scale);
  if (style.rotationDeg) context.rotate((style.rotationDeg * Math.PI) / 180);
  context.font = fontFor(style, scale);
  context.fillStyle = style.color;
  context.textAlign = style.align;
  context.textBaseline = style.baseline === 'top' ? 'top' : 'middle';
  if (style.maxWidthMm !== undefined) context.fillText(op.text, 0, 0, style.maxWidthMm * scale);
  else context.fillText(op.text, 0, 0);
  context.restore();
}

function drawOp(
  context: CanvasRenderingContext2D,
  op: DrawOp,
  scale: number,
  images: ReadonlyMap<string, HTMLImageElement>,
): void {
  switch (op.op) {
    case 'fill-rect':
      context.fillStyle = op.color;
      context.fillRect(op.rect.x * scale, op.rect.y * scale, op.rect.width * scale, op.rect.height * scale);
      return;
    case 'fill-polygon':
      context.fillStyle = op.color;
      tracePath(context, op.points, scale, true);
      context.fill();
      return;
    case 'line':
      context.strokeStyle = op.color;
      context.lineWidth = Math.max(1, op.widthMm * scale);
      tracePath(context, [op.from, op.to], scale, false);
      context.stroke();
      return;
    case 'image':
      drawArtwork(context, op.rect, op.artwork, op.fit, scale, images);
      return;
    case 'text':
      drawText(context, op, scale);
      return;
  }
}

function drawArtwork(
  context: CanvasRenderingContext2D,
  rect: { x: Mm; y: Mm; width: Mm; height: Mm },
  artwork: Artwork,
  fit: 'cover' | 'contain',
  scale: number,
  images: ReadonlyMap<string, HTMLImageElement>,
): void {
  const image = images.get(artwork.dataUrl);
  if (!image) return;
  const { source, dest } = fitImage(artwork, rect, fit);
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    dest.x * scale,
    dest.y * scale,
    dest.width * scale,
    dest.height * scale,
  );
}

function drawGuide(context: CanvasRenderingContext2D, guide: Guide, scale: number): void {
  context.save();
  context.strokeStyle = GUIDE_COLOR;
  context.lineWidth = Math.max(1, GUIDE_WIDTH_MM * scale);
  context.setLineDash(guide.kind === 'fold' ? FOLD_DASH_MM.map((mm) => mm * scale) : []);
  tracePath(context, guide.points, scale, guide.closed);
  context.stroke();
  context.restore();
}

function drawPlacement(
  context: CanvasRenderingContext2D,
  placement: PartPlacement,
  scale: number,
  images: ReadonlyMap<string, HTMLImageElement>,
): void {
  context.save();
  context.translate(placement.bounds.x * scale, placement.bounds.y * scale);
  for (const op of placement.ops) drawOp(context, op, scale, images);
  for (const guide of placement.guides) drawGuide(context, guide, scale);
  context.restore();
}

/** Renders `layout` onto a fresh canvas sized for `dpi`. */
export async function rasterizeSheet(layout: SheetLayout, dpi: number): Promise<HTMLCanvasElement> {
  const { width, height } = rasterSizePx(layout.paper, dpi);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('mdcovergen: this browser has no 2D canvas context');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);

  const images = await decodeAll(layout);
  const scale = mmToPx(1000, dpi) / 1000;
  for (const placement of layout.placements) drawPlacement(context, placement, scale, images);

  return canvas;
}

export async function sheetToPng(layout: SheetLayout, dpi: number): Promise<Uint8Array> {
  const canvas = await rasterizeSheet(layout, dpi);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('mdcovergen: the browser could not encode the Sheet as PNG');
  return new Uint8Array(await blob.arrayBuffer());
}

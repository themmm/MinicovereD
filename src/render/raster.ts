import type { Mm, Point } from '../domain/units.ts';
import { pxPerMm, rasterSizePx } from '../domain/units.ts';
import { fitImage } from './image-fit.ts';
import type { DrawOp, FoldKind, Guide, PartPlacement, PrintFace, SheetLayout, TextStyle } from './layout.ts';

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
 * A fold guide runs along a panel boundary, where a dark Spine or a full-bleed
 * Page would swallow a grey hairline. Laying the mark over a wider light stroke
 * keeps it readable on any background — and unlike ticks reaching past the Part,
 * it stays inside the printable margin.
 */
const GUIDE_HALO_COLOR = '#ffffff';
const GUIDE_HALO_WIDTH_MM: Mm = 0.5;

/**
 * One dash pattern per kind of fold, because the collector has to fold two of
 * them in opposite directions and the printed Sheet is the only instruction they
 * get (ADR-0012).
 *
 *  - `case` keeps the fine dash the J-Card's two folds have always had. Nothing
 *    about them changed, so nothing about how they read should.
 *  - `fore-edge` is a long dash: the fold that goes *away* from the printed side,
 *    where blank meets blank. Long because it is the commonest crease on the
 *    strip — every Insert has at least one — and because it has to be told apart
 *    at a glance from the one crease that goes the other way.
 *  - `spine` is dash-dot, the drafting convention for a fold that reverses. It is
 *    the booklet's hinge, printed meets printed, and there is exactly one of it
 *    on a four-Page strip.
 *
 * All three stay dashed and none is solid, deliberately: the cut outline is the
 * solid line on a Sheet, and a solid fold at the same colour and width would be
 * a line a collector could cut along by mistake. Being uncuttable is worth more
 * than the extra contrast.
 */
const FOLD_DASH_MM: Readonly<Record<FoldKind, readonly Mm[]>> = {
  case: [1.6, 1.2],
  'fore-edge': [4, 2],
  spine: [4, 1.2, 0.6, 1.2],
};

/**
 * The type a Part can be set in, and the print side of the quarantine (ADR-0008
 * rule 9). One stack per bundled face; a Template picks the *names* and this
 * module is the single source of the strings. `canvas-text-measurer.ts` imports
 * `fontFor` rather than restating any of them, so measuring and drawing cannot
 * disagree even now that they could disagree about which face.
 *
 * `--font-print-<face>` in `src/styles/fonts.css` has to read exactly the same
 * for every face here, and a test asserts each pair — the duplication is
 * unavoidable, because a canvas cannot read a custom property, so the only
 * alternative to a check is drift. The chrome face has no business in any of
 * them and a test keeps it out of all of them.
 *
 * Every stack falls through to the Noto pair before it reaches a generic
 * keyword, and that is not politeness: the five new faces ship Latin and
 * Latin-ext only, so Noto Sans is what renders a Cyrillic title and Noto Sans
 * JP is what makes a Japanese tracklist print at all. A face is a voice for the
 * type it can set, never a limit on what the Part may say.
 */
export const PRINT_FONT_STACKS: Readonly<Record<PrintFace, string>> = {
  sans: "'Noto Sans Variable', 'Noto Sans JP', system-ui, sans-serif",
  serif: "'Source Serif 4 Variable', 'Noto Sans Variable', 'Noto Sans JP', serif",
  slab: "'Bitter Variable', 'Noto Sans Variable', 'Noto Sans JP', serif",
  grotesque: "'Space Grotesk Variable', 'Noto Sans Variable', 'Noto Sans JP', sans-serif",
  condensed: "'Archivo Narrow Variable', 'Noto Sans Variable', 'Noto Sans JP', sans-serif",
  humanist: "'Cabin Variable', 'Noto Sans Variable', 'Noto Sans JP', sans-serif",
};

export function fontFor(style: TextStyle, scale: number): string {
  return `${style.weight} ${style.sizeMm * scale}px ${PRINT_FONT_STACKS[style.face]}`;
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

function drawImage(surface: Surface, op: Extract<DrawOp, { op: 'image' }>): void {
  const { context, scale } = surface;
  const image = surface.images.get(op.source.dataUrl);
  if (!image) return;

  const { source, dest } = fitImage(op.source, op.rect, op.fit);
  context.save();
  if (op.rotationDeg) {
    // Rotate about the rect's centre, so the caller reserves the box it sees.
    const centreX = (dest.x + dest.width / 2) * scale;
    const centreY = (dest.y + dest.height / 2) * scale;
    context.translate(centreX, centreY);
    context.rotate((op.rotationDeg * Math.PI) / 180);
    context.translate(-centreX, -centreY);
  }
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
  context.restore();
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
      drawImage(surface, op);
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
  context.setLineDash(
    guide.kind === 'fold' ? FOLD_DASH_MM[guide.fold].map((mm) => mm * scale) : [],
  );
  tracePath(surface, guide.points, guide.closed);
  context.stroke();
  context.restore();
}

function drawPlacement(surface: Surface, placement: PartPlacement): void {
  const { context, scale } = surface;
  context.save();
  context.translate(placement.bounds.x * scale, placement.bounds.y * scale);

  // The whole Part turns at once (ADR-0014), and this is the only place that
  // has to know: the drawing, the cut-outline clip and the guides below are all
  // in Part-local coordinates under this one transform, so one rotation here
  // turns the three of them together and none of them can be turned by half.
  //
  // Clockwise, so the Part's left edge is the one at the top of the Sheet — a
  // strip that reads left to right standing up reads top to bottom lying down.
  // The translate is by the box's width, which for a turned Part is its own
  // height: that is what brings the rotated Part back onto its box.
  if (placement.turned) {
    context.translate(placement.bounds.width * scale, 0);
    context.rotate(Math.PI / 2);
  }

  // Nothing a Template draws may leave the Part: an overlong tracklist has to
  // spill inside its own Page, not onto the Sheet around it.
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

  // Sheet-level marks are drawn in paper coordinates, on top of any Parts.
  for (const op of layout.ops ?? []) drawOp(surface, op);
  for (const guide of layout.guides ?? []) drawGuide(surface, guide);
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
    for (const op of placement.ops) if (op.op === 'image') urls.add(op.source.dataUrl);
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
  if (!context) throw new Error('minicovered: this browser has no 2D canvas context');

  drawSheet(context, layout, dpi, await decodeAll(layout));
  return canvas;
}

export async function sheetToPng(layout: SheetLayout, dpi: number): Promise<Uint8Array> {
  const canvas = await rasterizeSheet(layout, dpi);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('minicovered: the browser could not encode the Sheet as PNG');
  return new Uint8Array(await blob.arrayBuffer());
}

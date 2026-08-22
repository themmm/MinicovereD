import { printableArea } from '../domain/paper.ts';
import type { PaperSize } from '../domain/paper.ts';
import { LABEL_PRESETS, partShape } from '../domain/parts.ts';
import type { LabelDimensions, PartDimensions } from '../domain/parts.ts';
import { packParts } from '../pack/sheet-packer.ts';
import type { PackItem } from '../pack/sheet-packer.ts';
import type { Mm, Point, Rect } from '../domain/units.ts';
import type { DrawOp, Guide, PrintFace, SheetLayout, TextStyle } from './layout.ts';
import { ellipsise } from './text.ts';
import type { TextMeasurer } from './text.ts';

/**
 * The calibration sheet: a Sheet that prints nothing but measurements. A
 * 100 mm test square to check a printer against a ruler, and every Part and
 * Label preset outlined at 1:1 so a collector can hold a cartridge against the
 * paper before committing a design to it.
 *
 * The dimensions in this project come from sources that disagree by a
 * millimetre or two. This page is how that argument gets settled.
 */

/** Long enough that a percent of scaling error is a visible millimetre. */
export const CALIBRATION_SQUARE_MM: Mm = 100;

const SQUARE_LABEL = '100 mm test square';

const GAP: Mm = 8;
const INK = '#141414';
const RULE = '#8a8a8a';
const RULE_WIDTH: Mm = 0.2;
const CAPTION_SIZE: Mm = 3;
/**
 * Nothing on this sheet belongs to a Release, so no Template chose its type.
 * The neutral sans is right twice over: this page is an instrument rather than a
 * design, and it is the one stack that renders every script in a single face.
 * Every stack falls through to the same Noto pair, so any of them could set a
 * Cyrillic Label preset name — but the five voices would set the Latin half in
 * themselves and the rest in Noto, and a ruler should not change typeface
 * halfway down.
 */
const CALIBRATION_FACE: PrintFace = 'sans';
const CAPTION_GAP: Mm = 1.2;
const CAPTION_LINE: Mm = 3.8;
/** Name on one line, size on the next: a 35 mm Label has no room for both. */
const CAPTION_LINES = 2;

/** One outlined shape on the sheet, with the caption printed beneath it. */
export interface CalibrationFigure {
  readonly label: string;
  /** Which Sheet it landed on, counting from zero. */
  readonly sheet: number;
  /** Where it sits on that paper. */
  readonly bounds: Rect;
  /** Its outline in Part-local coordinates — notched, where the shape is. */
  readonly outline: readonly Point[];
  /** Fold positions along the outline's width, for the J-Card. */
  readonly folds?: readonly Mm[];
}

export interface CalibrationSheet {
  /**
   * One layout per printed Sheet. A generous printable margin can leave too
   * little room for every outline at 1:1, and shrinking them would defeat the
   * entire purpose, so the sheet runs onto as many pages as it needs.
   */
  readonly layouts: readonly SheetLayout[];
  readonly figures: readonly CalibrationFigure[];
  /** Outlines too wide for the printable area at all, named rather than dropped. */
  readonly omitted: readonly string[];
}

export interface CalibrationConfig {
  readonly paper: PaperSize;
  readonly marginMm: Mm;
}

const caption = (text: string, at: Point, measure: TextMeasurer, maxWidthMm: Mm): DrawOp => {
  const style: TextStyle = {
    sizeMm: CAPTION_SIZE,
    weight: 400,
    face: CALIBRATION_FACE,
    color: INK,
    align: 'left',
    baseline: 'top',
  };
  return { op: 'text', text: ellipsise(text, style, maxWidthMm, measure), at, style };
};

const heading = (text: string, at: Point, sizeMm: Mm, weight: 400 | 700): DrawOp => ({
  op: 'text',
  text,
  at,
  style: { sizeMm, weight, face: CALIBRATION_FACE, color: INK, align: 'left', baseline: 'top' },
});

/** What a calibration figure needs beyond a rectangle. */
interface Figure {
  readonly label: string;
  readonly outline: readonly Point[];
  readonly folds?: readonly Mm[];
}

/** Room under every figure for its two caption lines. */
const CAPTION_ROOM: Mm = CAPTION_GAP + CAPTION_LINES * CAPTION_LINE;

/** Height of the instruction block on the first page, and of the heading on later ones. */
const FIRST_PAGE_TOP: Mm = 22;
const LATER_PAGE_TOP: Mm = 8;

/** A Label preset's shape, without disturbing the dimensions in use. */
function presetShape(dimensions: PartDimensions, label: LabelDimensions) {
  return partShape('label', { ...dimensions, label });
}

function squareOutline(size: Mm): Point[] {
  return [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
}

/** Ticks every 10 mm along the square's top and left edges, so a ruler has something to line up with. */
function squareTicks(bounds: Rect): DrawOp[] {
  const ops: DrawOp[] = [];
  for (let offset = 10; offset < CALIBRATION_SQUARE_MM; offset += 10) {
    const long = offset % 50 === 0;
    const length = long ? 4 : 2;
    ops.push({
      op: 'line',
      from: { x: bounds.x + offset, y: bounds.y },
      to: { x: bounds.x + offset, y: bounds.y + length },
      color: RULE,
      widthMm: RULE_WIDTH,
    });
    ops.push({
      op: 'line',
      from: { x: bounds.x, y: bounds.y + offset },
      to: { x: bounds.x + length, y: bounds.y + offset },
      color: RULE,
      widthMm: RULE_WIDTH,
    });
  }
  return ops;
}

export function renderCalibrationSheet(
  config: CalibrationConfig,
  dimensions: PartDimensions,
  measure: TextMeasurer,
): CalibrationSheet {
  const area = printableArea(config.paper, config.marginMm);

  const instructions: DrawOp[] = [
    heading('MinicovereD calibration sheet', { x: area.x, y: area.y }, 5, 700),
    heading(
      'Print at 100% — no “fit to page”, no scaling. Then measure the square with a ruler.',
      { x: area.x, y: area.y + 6.5 },
      3.2,
      400,
    ),
    heading(
      'If it is not 100 mm across, your printer is scaling: fix that before cutting anything out.',
      { x: area.x, y: area.y + 10.8 },
      3.2,
      400,
    ),
    heading(
      'The outlines below are 1:1. Hold a cartridge and a case against them to choose your sizes.',
      { x: area.x, y: area.y + 15.1 },
      3.2,
      400,
    ),
  ];

  const jcard = partShape('jcard', dimensions);
  const backCard = partShape('back-card', dimensions);
  const { innerFlapWidth, spineWidth } = dimensions.jcard;

  const currentLabel = partShape('label', dimensions);
  const matchesPreset = LABEL_PRESETS.some(
    (preset) =>
      preset.dimensions.width === dimensions.label.width &&
      preset.dimensions.height === dimensions.label.height &&
      preset.dimensions.notch === dimensions.label.notch,
  );

  const shapes: Array<PackItem<Figure>> = [
    {
      ref: { label: SQUARE_LABEL, outline: squareOutline(CALIBRATION_SQUARE_MM) },
      label: SQUARE_LABEL,
      size: { width: CALIBRATION_SQUARE_MM, height: CALIBRATION_SQUARE_MM },
    },
    {
      ref: {
        label: 'J-Card',
        outline: jcard.outline,
        folds: [innerFlapWidth, innerFlapWidth + spineWidth],
      },
      label: 'J-Card',
      size: jcard.size,
    },
    { ref: { label: 'Back Card', outline: backCard.outline }, label: 'Back Card', size: backCard.size },
    // The Label this Release is actually set to, when it is not one of the
    // presets. Nudging the size is exactly when you want your own outline to
    // hold a cartridge against (story 18).
    ...(matchesPreset
      ? []
      : [
          {
            ref: { label: 'Label — this Release', outline: currentLabel.outline },
            label: 'Label — this Release',
            size: currentLabel.size,
          },
        ]),
    ...LABEL_PRESETS.map((preset): PackItem<Figure> => {
      const shape = presetShape(dimensions, preset.dimensions);
      return {
        ref: { label: `Label — ${preset.name}`, outline: shape.outline },
        label: `Label — ${preset.name}`,
        size: shape.size,
      };
    }),
  ];

  const packed = packParts(shapes, {
    paper: config.paper,
    marginMm: config.marginMm,
    gapMm: GAP,
    captionRoomMm: CAPTION_ROOM,
    firstSheetTopMm: FIRST_PAGE_TOP,
    laterSheetTopMm: LATER_PAGE_TOP,
    oversize: 'omit',
    // A page to read, not a page to cut up: keep the reading order.
    sortByHeight: false,
  });

  const figures: CalibrationFigure[] = packed.sheets.flatMap((sheet, index) =>
    sheet.placements.map(({ item, rect }) => ({
      label: item.ref.label,
      sheet: index,
      bounds: rect,
      outline: item.ref.outline,
      ...(item.ref.folds ? { folds: item.ref.folds } : {}),
    })),
  );
  const omitted = packed.omitted;

  const sheetCount = Math.max(packed.sheets.length, 1);
  const guides: Guide[][] = Array.from({ length: sheetCount }, () => []);
  const ops: DrawOp[][] = Array.from({ length: sheetCount }, (_, index) =>
    index === 0
      ? [...instructions]
      : [
          // Inside the printable area: LATER_PAGE_TOP is reserved for exactly this.
          heading(
            `MinicovereD calibration sheet — page ${index + 1} of ${sheetCount}`,
            { x: area.x, y: area.y },
            3.2,
            700,
          ),
        ],
  );

  for (const figure of figures) {
    (guides[figure.sheet] as Guide[]).push({
      kind: 'cut',
      points: figure.outline.map((point) => ({
        x: figure.bounds.x + point.x,
        y: figure.bounds.y + point.y,
      })),
      closed: true,
    });

    for (const fold of figure.folds ?? []) {
      (guides[figure.sheet] as Guide[]).push({
        kind: 'fold',
        points: [
          { x: figure.bounds.x + fold, y: figure.bounds.y },
          { x: figure.bounds.x + fold, y: figure.bounds.y + figure.bounds.height },
        ],
        closed: false,
      });
    }

    // A caption may spill into the gap beside its figure but has to stop short
    // of the next one, or two captions touch on the paper.
    const captionWidth = figure.bounds.width + GAP / 2;
    const captionTop = figure.bounds.y + figure.bounds.height + CAPTION_GAP;
    const sheetOps = ops[figure.sheet] as DrawOp[];
    sheetOps.push(
      caption(figure.label, { x: figure.bounds.x, y: captionTop }, measure, captionWidth),
      caption(
        `${figure.bounds.width} × ${figure.bounds.height} mm`,
        { x: figure.bounds.x, y: captionTop + CAPTION_LINE },
        measure,
        captionWidth,
      ),
    );

    if (figure.label === SQUARE_LABEL) sheetOps.push(...squareTicks(figure.bounds));
  }

  // Footers stack down the last page instead of printing on top of each other.
  const lastSheet = sheetCount - 1;
  let footerY = (packed.contentBottom[lastSheet] ?? area.y) + GAP;
  const footer = (text: string): void => {
    if (footerY + CAPTION_LINE > area.y + area.height) return;
    (ops[lastSheet] as DrawOp[]).push(heading(text, { x: area.x, y: footerY }, 3, 400));
    footerY += CAPTION_LINE;
  };

  footer('Every outline above is drawn from the dimensions this app is currently set to.');
  if (omitted.length > 0) {
    footer(`Too large for this printable area, so not shown: ${omitted.join(', ')}.`);
    footer('Reduce the printable margin to fit them.');
  }

  return {
    layouts: Array.from({ length: sheetCount }, (_, index) => ({
      paper: config.paper,
      marginMm: config.marginMm,
      placements: [],
      ops: ops[index] ?? [],
      guides: guides[index] ?? [],
    })),
    figures,
    omitted,
  };
}

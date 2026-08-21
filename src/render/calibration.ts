import { printableArea } from '../domain/paper.ts';
import type { PaperSize } from '../domain/paper.ts';
import { LABEL_PRESETS, partShape } from '../domain/parts.ts';
import type { PartDimensions } from '../domain/parts.ts';
import type { Mm, Point, Rect } from '../domain/units.ts';
import type { DrawOp, Guide, SheetLayout, TextStyle } from './layout.ts';
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

const GAP: Mm = 8;
const INK = '#141414';
const RULE = '#8a8a8a';
const RULE_WIDTH: Mm = 0.2;
const CAPTION_SIZE: Mm = 3;
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
  style: { sizeMm, weight, color: INK, align: 'left', baseline: 'top' },
});

interface Shape {
  readonly label: string;
  readonly width: Mm;
  readonly height: Mm;
  readonly outline: readonly Point[];
  readonly folds?: readonly Mm[];
}

/**
 * Lays figures out in rows, wrapping when a row runs out of width and starting
 * a new Sheet when the page runs out of height. Nothing is ever scaled: an
 * outline that is not 1:1 is worse than useless.
 */
function arrange(
  shapes: readonly Shape[],
  area: Rect,
  firstSheetTop: Mm,
): { figures: CalibrationFigure[]; omitted: string[]; bottomOfSheet: Map<number, Mm> } {
  const figures: CalibrationFigure[] = [];
  const omitted: string[] = [];
  const bottomOfSheet = new Map<number, Mm>();
  // Each figure reserves room under it for its two caption lines.
  const captionRoom = CAPTION_GAP + CAPTION_LINES * CAPTION_LINE;

  let sheet = 0;
  let cursorX = area.x;
  let cursorY = firstSheetTop;
  let rowHeight = 0;

  const closeRow = (): void => {
    bottomOfSheet.set(sheet, cursorY + rowHeight + captionRoom);
    cursorX = area.x;
    cursorY += rowHeight + captionRoom + GAP;
    rowHeight = 0;
  };

  for (const shape of shapes) {
    if (shape.width > area.width || shape.height + captionRoom > area.height) {
      omitted.push(shape.label);
      continue;
    }
    if (cursorX > area.x && cursorX + shape.width > area.x + area.width) closeRow();
    if (cursorY + shape.height + captionRoom > area.y + area.height) {
      closeRow();
      sheet += 1;
      cursorX = area.x;
      cursorY = area.y;
      rowHeight = 0;
    }

    figures.push({
      label: shape.label,
      sheet,
      bounds: { x: cursorX, y: cursorY, width: shape.width, height: shape.height },
      outline: shape.outline,
      ...(shape.folds ? { folds: shape.folds } : {}),
    });
    cursorX += shape.width + GAP;
    rowHeight = Math.max(rowHeight, shape.height);
  }
  bottomOfSheet.set(sheet, cursorY + rowHeight + captionRoom);

  return { figures, omitted, bottomOfSheet };
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
    heading('mdcovergen calibration sheet', { x: area.x, y: area.y }, 5, 700),
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

  const { figures, omitted, bottomOfSheet } = arrange(
    [
      {
        label: '100 mm test square',
        width: CALIBRATION_SQUARE_MM,
        height: CALIBRATION_SQUARE_MM,
        outline: squareOutline(CALIBRATION_SQUARE_MM),
      },
      {
        label: 'J-Card',
        width: jcard.size.width,
        height: jcard.size.height,
        outline: jcard.outline,
        folds: [innerFlapWidth, innerFlapWidth + spineWidth],
      },
      {
        label: 'Back Card',
        width: backCard.size.width,
        height: backCard.size.height,
        outline: backCard.outline,
      },
      ...LABEL_PRESETS.map((preset) => {
        const shape = partShape('label', { ...dimensions, label: preset.dimensions });
        return {
          label: `Label — ${preset.name}`,
          width: shape.size.width,
          height: shape.size.height,
          outline: shape.outline,
        };
      }),
    ],
    area,
    area.y + 22,
  );

  const sheetCount = Math.max(...figures.map((figure) => figure.sheet), 0) + 1;
  const guides: Guide[][] = Array.from({ length: sheetCount }, () => []);
  const ops: DrawOp[][] = Array.from({ length: sheetCount }, (_, index) =>
    index === 0
      ? [...instructions]
      : [
          heading(
            `mdcovergen calibration sheet — page ${index + 1} of ${sheetCount}`,
            { x: area.x, y: area.y - CAPTION_LINE - 1 },
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

    // A caption may spill into the gap beside its figure but never as far as
    // the next one's, or two captions run into each other on the paper.
    const captionWidth = figure.bounds.width + GAP;
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

    if (figure.label === '100 mm test square') sheetOps.push(...squareTicks(figure.bounds));
  }

  const footerOn = (sheet: number, text: string): void => {
    const bottom = bottomOfSheet.get(sheet) ?? area.y;
    if (bottom + GAP + CAPTION_LINE > area.y + area.height) return;
    (ops[sheet] as DrawOp[]).push(heading(text, { x: area.x, y: bottom + GAP }, 3, 400));
  };

  footerOn(
    sheetCount - 1,
    'Every outline above is drawn from the dimensions this app is currently set to.',
  );
  if (omitted.length > 0) {
    footerOn(
      sheetCount - 1,
      `Too large for this printable area, so not shown: ${omitted.join(', ')}. Reduce the margin.`,
    );
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

import { printableArea } from '../domain/paper.ts';
import type { PaperSize } from '../domain/paper.ts';
import type { Mm, Rect, Size } from '../domain/units.ts';

/**
 * SheetPacker: from rectangles, a paper size and a printable margin to Sheet
 * placements. Pure geometry — it knows nothing about Parts, Templates, artwork
 * or Releases, which is what lets it be tested with plain rectangles, reasoned
 * about as a bin-packing problem, and reused by anything that needs shapes laid
 * out on paper. The calibration sheet uses it for outlines that are not Parts
 * at all.
 *
 * Part toggles live in the caller: packing only what it is handed is what makes
 * "Labels only" a filter rather than a mode.
 */

export interface PackItem<T> {
  /** Whatever the caller wants back with the placement. */
  readonly ref: T;
  /** What this rectangle is, used only when it does not fit and has to be named. */
  readonly label: string;
  /**
   * The rectangle as the caller means it, standing up. A turned placement
   * reports the swapped box in its `rect`; this stays the size that was asked
   * for, so a caller can still draw the thing in its own coordinates.
   */
  readonly size: Size;
}

export interface PackConfig {
  readonly paper: PaperSize;
  /** Kept clear of content, so home printers never clip a Part. */
  readonly marginMm: Mm;
  /** Space between neighbouring Parts, so two cut lines never merge into one. */
  readonly gapMm: Mm;
  /** Room kept free at the top of the first Sheet, for a heading. */
  readonly firstSheetTopMm?: Mm;
  /** Room kept free at the top of every later Sheet, for its continuation heading. */
  readonly laterSheetTopMm?: Mm;
  /** Extra height each rectangle needs beneath it, for a caption. */
  readonly captionRoomMm?: Mm;
  readonly oversize?: OversizePolicy;
  readonly turn?: TurnPolicy;
  /**
   * Whether the space left under a placed rectangle may hold a column of
   * shorter ones. Off unless asked for.
   *
   * ADR-0014's arithmetic needs it: two turned Inserts leave a strip beside
   * them that is one Label wide and most of the Sheet tall, and shelf packing
   * on its own can only ever put one Label at the top of it — every rectangle
   * on a shelf shares that shelf's top edge, so five of them cannot make a
   * column.
   *
   * A shelf's own row is filled first and a column is opened only when the row
   * has no space left, so switching this on never moves a rectangle that would
   * have fitted beside its neighbours. It fills room a shelf was already
   * wasting.
   *
   * The calibration sheet leaves it off for the reason it leaves `sortByHeight`
   * off: a column reads after the figure to its right rather than under it, and
   * that page is meant to be read.
   */
  readonly columns?: boolean;
}

export interface PackResult<T> {
  readonly sheets: ReadonlyArray<PackedSheet<T>>;
  /** Rectangles too large for the printable area, named rather than mislaid. */
  readonly omitted: readonly string[];
  /** Where the content ends on each Sheet, so a caller can put a footer under it. */
  readonly contentBottom: readonly Mm[];
}

/** Breathing room between Parts so two cut lines never end up on top of each other. */
export const DEFAULT_PART_GAP_MM: Mm = 4;

export interface PackPlacement<T> {
  readonly item: PackItem<T>;
  /**
   * Position on the Sheet, from the paper's top-left corner. A turned
   * rectangle's box is already swapped here, so anything measuring how much
   * paper is used reads this and never has to ask which way round it went.
   */
  readonly rect: Rect;
  /**
   * Placed on its side. The turn is 90° clockwise, which is what puts the
   * rectangle's left edge at the top of the Sheet — a strip that reads left to
   * right standing up still reads top to bottom lying down.
   */
  readonly turned: boolean;
}

export interface PackedSheet<T> {
  readonly placements: ReadonlyArray<PackPlacement<T>>;
}

/**
 * What to do with a rectangle too large for the printable area. Parts must not
 * be silently mislaid, so packing a Release throws; the calibration sheet would
 * rather print what it can and name the rest.
 */
export type OversizePolicy = 'throw' | 'omit';

/**
 * Whether a rectangle that will not fit the printable area as it stands may be
 * placed on its side (ADR-0014: the Part turns, not the Sheet).
 *
 * `to-fit` is a rescue and not an optimisation: a rectangle that already fits
 * is never turned. Turning for density would be a different heuristic and a
 * worse one — a two-Page Insert is 152.5 × 79 mm and goes three to an A4 Sheet
 * standing up, but only two lying down.
 *
 * The calibration sheet stays on `never`, and not only by inertia: its figures
 * are outlines it draws itself in paper coordinates from the packed box, so a
 * turned box would print a J-Card outline lying inside a rectangle standing up.
 */
export type TurnPolicy = 'never' | 'to-fit';

/** The geometry every placement decision is made against. */
interface Bed {
  readonly area: Rect;
  readonly gapMm: Mm;
  /** Reserved under every rectangle, including the ones stacked in a column. */
  readonly captionRoomMm: Mm;
}

/** A rectangle with the orientation it will be placed in already decided. */
interface Piece<T> {
  readonly item: PackItem<T>;
  /** The box actually placed: `item.size`, swapped when `turned`. */
  readonly size: Size;
  readonly turned: boolean;
}

/**
 * A column growing downwards under one rectangle already on a shelf, used only
 * when `columns` is on.
 *
 * Its width is the width of the rectangle that opened it rather than everything
 * free to the right of it. That is deliberately conservative: what is free to
 * the right depends on how tall the next rectangle along the shelf is, and a
 * column that never reaches past the rectangle above it cannot overlap anything
 * or eat into anyone's gap.
 */
interface Column {
  readonly x: Mm;
  readonly width: Mm;
  /** Bottom edge of the last rectangle in the column. */
  cursorY: Mm;
}

/**
 * A row of Parts sharing a top edge. Its height is fixed when it opens and
 * never changes: `usedHeight` below records where the last-opened shelf ends,
 * and would go stale if a shelf could grow after the fact. `fitsOnShelf`
 * enforces that by refusing anything taller.
 */
interface Shelf {
  /** Top edge of the shelf on the Sheet. */
  readonly y: Mm;
  readonly height: Mm;
  /** Right edge of the last Part placed, or the area's left edge when empty. */
  cursorX: Mm;
  /** One per rectangle placed on the row, in the order they were placed. */
  readonly columns: Column[];
}

interface Sheet<T> {
  readonly placements: Array<PackPlacement<T>>;
  readonly shelves: Shelf[];
  /** Bottom edge of the last shelf opened on this Sheet. */
  usedHeight: Mm;
}

/** Where the next Part on this shelf would start — no leading gap on an empty shelf. */
function nextX(shelf: Shelf, bed: Bed): Mm {
  return shelf.cursorX === bed.area.x ? bed.area.x : shelf.cursorX + bed.gapMm;
}

function fitsOnShelf(shelf: Shelf, size: Size, bed: Bed): boolean {
  return nextX(shelf, bed) + size.width <= bed.area.x + bed.area.width && size.height <= shelf.height;
}

function placeOnShelf<T>(sheet: Sheet<T>, shelf: Shelf, piece: Piece<T>, bed: Bed): void {
  const x = nextX(shelf, bed);
  sheet.placements.push({ item: piece.item, rect: { x, y: shelf.y, ...piece.size }, turned: piece.turned });
  shelf.cursorX = x + piece.size.width;
  shelf.columns.push({ x, width: piece.size.width, cursorY: shelf.y + piece.size.height });
}

/** Where a rectangle stacked in `column` would start, and whether it still fits the shelf. */
function fitsInColumn(shelf: Shelf, column: Column, size: Size, bed: Bed): boolean {
  if (size.width > column.width) return false;
  const y = column.cursorY + bed.captionRoomMm + bed.gapMm;
  return y + size.height + bed.captionRoomMm <= shelf.y + shelf.height;
}

function placeInColumn<T>(sheet: Sheet<T>, column: Column, piece: Piece<T>, bed: Bed): void {
  const y = column.cursorY + bed.captionRoomMm + bed.gapMm;
  sheet.placements.push({
    item: piece.item,
    rect: { x: column.x, y, ...piece.size },
    turned: piece.turned,
  });
  column.cursorY = y + piece.size.height;
}

function openShelf<T>(sheet: Sheet<T>, piece: Piece<T>, bed: Bed, topMm: Mm): Shelf | undefined {
  const y = sheet.shelves.length === 0 ? topMm : sheet.usedHeight + bed.captionRoomMm + bed.gapMm;
  if (y + piece.size.height + bed.captionRoomMm > bed.area.y + bed.area.height) return undefined;

  const shelf: Shelf = { y, height: piece.size.height, cursorX: bed.area.x, columns: [] };
  sheet.shelves.push(shelf);
  sheet.usedHeight = y + piece.size.height;
  return shelf;
}

/** The same rectangle on its side. */
function turnedSize(size: Size): Size {
  return { width: size.height, height: size.width };
}

/**
 * The largest printable margin at which `size` would fit `paper`, negative when
 * no margin does.
 *
 * Worked out rather than searched for, and reported when a rectangle is
 * refused: "does not fit" is a fact, "lower the margin to 7.25 mm" is something
 * the collector can act on. This is the case ADR-0014 says will actually
 * happen, because 5 mm is a default that home printers routinely need raised.
 */
function largestMarginThatFits(paper: PaperSize, size: Size, captionRoomMm: Mm, turn: TurnPolicy): Mm {
  const standing = Math.min(
    (paper.width - size.width) / 2,
    (paper.height - size.height - captionRoomMm) / 2,
  );
  if (turn === 'never') return standing;
  const lying = Math.min(
    (paper.width - size.height) / 2,
    (paper.height - size.width - captionRoomMm) / 2,
  );
  return Math.max(standing, lying);
}

/** Rounded down, so the margin named is one that really does leave room. */
function downTo2dp(mm: Mm): Mm {
  return Math.floor(mm * 100) / 100;
}

/**
 * Bin-packs rectangles onto as few Sheets as possible: first-fit-decreasing-height,
 * the standard shelf heuristic. Sorting by height first means the tallest
 * rectangle of each row opens the shelf and shorter ones fill the width beside
 * it — so a Label rides along on the J-Card's row instead of stranding a row of
 * its own. A good heuristic, not an optimal packing.
 *
 * Order is preserved for the caller: `sortByHeight` can be turned off where a
 * fixed reading order matters more than density, as it does on a page meant to
 * be read rather than cut up.
 *
 * Two things happen before any of that, and both are off unless asked for.
 * `turn` decides each rectangle's orientation once, up front, so the sort and
 * every fit test afterwards see the box that will actually be placed. `columns`
 * lets the room under a placed rectangle be filled.
 */
export function packParts<T>(
  items: ReadonlyArray<PackItem<T>>,
  config: PackConfig & { readonly sortByHeight?: boolean },
): PackResult<T> {
  const captionRoomMm = config.captionRoomMm ?? 0;
  const bed: Bed = {
    area: printableArea(config.paper, config.marginMm),
    gapMm: config.gapMm,
    captionRoomMm,
  };
  const { area } = bed;
  const firstTop = area.y + (config.firstSheetTopMm ?? 0);
  const laterTop = area.y + (config.laterSheetTopMm ?? 0);
  const oversize = config.oversize ?? 'throw';
  const turn = config.turn ?? 'never';
  const columnsAllowed = config.columns ?? false;

  const fitsArea = (size: Size): boolean =>
    size.width <= area.width && size.height + captionRoomMm <= area.height;

  const omitted: string[] = [];
  const usable: Array<Piece<T>> = [];
  for (const item of items) {
    // Standing up wins ties: a rectangle that fits as it is stays as it is.
    if (fitsArea(item.size)) {
      usable.push({ item, size: item.size, turned: false });
      continue;
    }
    if (turn === 'to-fit' && fitsArea(turnedSize(item.size))) {
      usable.push({ item, size: turnedSize(item.size), turned: true });
      continue;
    }
    if (oversize === 'throw') {
      const largest = largestMarginThatFits(config.paper, item.size, captionRoomMm, turn);
      const eitherWay = turn === 'to-fit' ? ', turned or not' : '';
      throw new Error(
        `minicovered: ${item.label} (${item.size.width} × ${item.size.height} mm) does not fit ` +
          `${config.paper.name} with a printable margin of ${config.marginMm} mm${eitherWay} — that ` +
          `leaves ${area.width} × ${area.height} mm to print on. ` +
          (largest >= 0
            ? `Lower the margin to ${downTo2dp(largest)} mm to make room for it.`
            : `No margin makes room for it: ${config.paper.name} is too small.`),
      );
    }
    omitted.push(item.label);
  }

  // Stable descending sort by height: equal heights keep the queue's order, so
  // a Release's Parts stay adjacent when nothing forces them apart.
  const ordered =
    config.sortByHeight === false
      ? usable
      : usable
          .map((piece, index) => ({ piece, index }))
          .sort((a, b) => b.piece.size.height - a.piece.size.height || a.index - b.index)
          .map(({ piece }) => piece);

  const sheets: Array<Sheet<T>> = [];
  const topFor = (index: number): Mm => (index === 0 ? firstTop : laterTop);

  for (const piece of ordered) {
    let placed = false;

    for (const [index, sheet] of sheets.entries()) {
      const shelf = sheet.shelves.find((candidate) => fitsOnShelf(candidate, piece.size, bed));
      if (shelf) {
        placeOnShelf(sheet, shelf, piece, bed);
        placed = true;
        break;
      }
      // Only once no row on this Sheet has width left: a column costs no new
      // height, so it is worth more than a fresh shelf, and less than a seat
      // beside a neighbour.
      const inColumn = columnsAllowed
        ? sheet.shelves
            .flatMap((candidate) =>
              candidate.columns.filter((column) => fitsInColumn(candidate, column, piece.size, bed)),
            )
            .at(0)
        : undefined;
      if (inColumn) {
        placeInColumn(sheet, inColumn, piece, bed);
        placed = true;
        break;
      }
      const opened = openShelf(sheet, piece, bed, topFor(index));
      if (opened) {
        placeOnShelf(sheet, opened, piece, bed);
        placed = true;
        break;
      }
    }

    if (placed) continue;

    const sheet: Sheet<T> = { placements: [], shelves: [], usedHeight: 0 };
    sheets.push(sheet);
    const shelf = openShelf(sheet, piece, bed, topFor(sheets.length - 1));
    // Every usable rectangle was measured against the printable area above, so
    // a fresh Sheet always has room for one.
    if (!shelf) {
      throw new Error(`minicovered: ${piece.item.label} fits the paper but failed to open a Sheet`);
    }
    placeOnShelf(sheet, shelf, piece, bed);
  }

  return {
    sheets: sheets.map((sheet) => ({ placements: sheet.placements })),
    omitted,
    contentBottom: sheets.map((sheet) => sheet.usedHeight + captionRoomMm),
  };
}

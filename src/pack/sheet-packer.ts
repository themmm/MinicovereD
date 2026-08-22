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
  /** Position on the Sheet, from the paper's top-left corner. */
  readonly rect: Rect;
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

/** The geometry every placement decision is made against. */
interface Bed {
  readonly area: Rect;
  readonly gapMm: Mm;
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

function placeOnShelf<T>(sheet: Sheet<T>, shelf: Shelf, item: PackItem<T>, bed: Bed): void {
  const x = nextX(shelf, bed);
  sheet.placements.push({ item, rect: { x, y: shelf.y, ...item.size } });
  shelf.cursorX = x + item.size.width;
}

function openShelf<T>(
  sheet: Sheet<T>,
  item: PackItem<T>,
  bed: Bed,
  topMm: Mm,
  captionRoomMm: Mm,
): Shelf | undefined {
  const y = sheet.shelves.length === 0 ? topMm : sheet.usedHeight + captionRoomMm + bed.gapMm;
  if (y + item.size.height + captionRoomMm > bed.area.y + bed.area.height) return undefined;

  const shelf: Shelf = { y, height: item.size.height, cursorX: bed.area.x };
  sheet.shelves.push(shelf);
  sheet.usedHeight = y + item.size.height;
  return shelf;
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
 */
export function packParts<T>(
  items: ReadonlyArray<PackItem<T>>,
  config: PackConfig & { readonly sortByHeight?: boolean },
): PackResult<T> {
  const bed: Bed = { area: printableArea(config.paper, config.marginMm), gapMm: config.gapMm };
  const { area } = bed;
  const captionRoomMm = config.captionRoomMm ?? 0;
  const firstTop = area.y + (config.firstSheetTopMm ?? 0);
  const laterTop = area.y + (config.laterSheetTopMm ?? 0);
  const oversize = config.oversize ?? 'throw';

  const tooBig = (item: PackItem<T>): boolean =>
    item.size.width > area.width || item.size.height + captionRoomMm > area.height;

  const omitted: string[] = [];
  const usable: Array<PackItem<T>> = [];
  for (const item of items) {
    if (!tooBig(item)) {
      usable.push(item);
      continue;
    }
    if (oversize === 'throw') {
      throw new Error(
        `minicovered: ${item.label} (${item.size.width} × ${item.size.height} mm) does not fit ` +
          `the ${area.width} × ${area.height} mm printable area`,
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
          .map((item, index) => ({ item, index }))
          .sort((a, b) => b.item.size.height - a.item.size.height || a.index - b.index)
          .map(({ item }) => item);

  const sheets: Array<Sheet<T>> = [];
  const topFor = (index: number): Mm => (index === 0 ? firstTop : laterTop);

  for (const item of ordered) {
    let placed = false;

    for (const [index, sheet] of sheets.entries()) {
      const shelf = sheet.shelves.find((candidate) => fitsOnShelf(candidate, item.size, bed));
      if (shelf) {
        placeOnShelf(sheet, shelf, item, bed);
        placed = true;
        break;
      }
      const opened = openShelf(sheet, item, bed, topFor(index), captionRoomMm);
      if (opened) {
        placeOnShelf(sheet, opened, item, bed);
        placed = true;
        break;
      }
    }

    if (placed) continue;

    const sheet: Sheet<T> = { placements: [], shelves: [], usedHeight: 0 };
    sheets.push(sheet);
    const shelf = openShelf(sheet, item, bed, topFor(sheets.length - 1), captionRoomMm);
    // Every usable item was measured against the printable area above, so a
    // fresh Sheet always has room for one.
    if (!shelf) {
      throw new Error(`minicovered: ${item.label} fits the paper but failed to open a Sheet`);
    }
    placeOnShelf(sheet, shelf, item, bed);
  }

  return {
    sheets: sheets.map((sheet) => ({ placements: sheet.placements })),
    omitted,
    contentBottom: sheets.map((sheet) => sheet.usedHeight + captionRoomMm),
  };
}

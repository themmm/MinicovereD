import { printableArea } from '../domain/paper.ts';
import type { PaperSize } from '../domain/paper.ts';
import type { PartKind } from '../domain/parts.ts';
import type { Mm, Rect, Size } from '../domain/units.ts';

/**
 * SheetPacker: from Parts with dimensions, a paper size and a printable margin
 * to Sheet placements. Pure geometry — it knows nothing about Templates,
 * artwork or Releases beyond an id, which is what lets it be tested with plain
 * rectangles and reasoned about as a bin-packing problem.
 *
 * Part toggles live in the caller: packing only what it is handed is what makes
 * "Labels only" a filter rather than a mode.
 */

export interface PackItem {
  readonly releaseId: string;
  readonly part: PartKind;
  readonly size: Size;
}

export interface PackConfig {
  readonly paper: PaperSize;
  /** Kept clear of content, so home printers never clip a Part. */
  readonly marginMm: Mm;
  /** Space between neighbouring Parts, so two cut lines never merge into one. */
  readonly gapMm: Mm;
}

/** Breathing room between Parts so two cut lines never end up on top of each other. */
export const DEFAULT_PART_GAP_MM: Mm = 4;

export interface PackPlacement {
  readonly item: PackItem;
  /** Position on the Sheet, from the paper's top-left corner. */
  readonly rect: Rect;
}

export interface PackedSheet {
  readonly placements: readonly PackPlacement[];
}

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

interface Sheet {
  readonly placements: PackPlacement[];
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

function placeOnShelf(sheet: Sheet, shelf: Shelf, item: PackItem, bed: Bed): void {
  const x = nextX(shelf, bed);
  sheet.placements.push({ item, rect: { x, y: shelf.y, ...item.size } });
  shelf.cursorX = x + item.size.width;
}

function openShelf(sheet: Sheet, item: PackItem, bed: Bed): Shelf | undefined {
  const y = sheet.shelves.length === 0 ? bed.area.y : sheet.usedHeight + bed.gapMm;
  if (y + item.size.height > bed.area.y + bed.area.height) return undefined;

  const shelf: Shelf = { y, height: item.size.height, cursorX: bed.area.x };
  sheet.shelves.push(shelf);
  sheet.usedHeight = y + item.size.height;
  return shelf;
}

/**
 * Bin-packs Parts onto as few Sheets as possible: first-fit-decreasing-height,
 * the standard shelf heuristic. Sorting by height first means the tallest Part
 * of each row opens the shelf and shorter ones fill the width beside it — so a
 * Label rides along on the J-Card's row instead of stranding a row of its own.
 * It is a good heuristic, not an optimal packing.
 */
export function packParts(items: readonly PackItem[], config: PackConfig): readonly PackedSheet[] {
  const bed: Bed = { area: printableArea(config.paper, config.marginMm), gapMm: config.gapMm };
  const { area } = bed;

  for (const item of items) {
    if (item.size.width > area.width || item.size.height > area.height) {
      throw new Error(
        `mdcovergen: the ${item.part} of ${item.releaseId} (${item.size.width} × ` +
          `${item.size.height} mm) does not fit the ${area.width} × ${area.height} mm printable area`,
      );
    }
  }

  // Stable descending sort by height: equal heights keep the queue's order, so
  // a Release's Parts stay adjacent when nothing forces them apart.
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.size.height - a.item.size.height || a.index - b.index)
    .map(({ item }) => item);

  const sheets: Sheet[] = [];

  for (const item of ordered) {
    let placed = false;

    for (const sheet of sheets) {
      const shelf = sheet.shelves.find((candidate) => fitsOnShelf(candidate, item.size, bed));
      if (shelf) {
        placeOnShelf(sheet, shelf, item, bed);
        placed = true;
        break;
      }
      const opened = openShelf(sheet, item, bed);
      if (opened) {
        placeOnShelf(sheet, opened, item, bed);
        placed = true;
        break;
      }
    }

    if (placed) continue;

    const sheet: Sheet = { placements: [], shelves: [], usedHeight: 0 };
    sheets.push(sheet);
    const shelf = openShelf(sheet, item, bed);
    // Every item was checked against the printable area above, so a fresh
    // Sheet always has room for one.
    if (!shelf) throw new Error('mdcovergen: a Part that fits the paper failed to open a Sheet');
    placeOnShelf(sheet, shelf, item, bed);
  }

  return sheets.map((sheet) => ({ placements: sheet.placements }));
}

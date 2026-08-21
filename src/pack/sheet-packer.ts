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

export interface PackPlacement {
  readonly item: PackItem;
  /** Position on the Sheet, from the paper's top-left corner. */
  readonly rect: Rect;
}

export interface PackedSheet {
  readonly placements: readonly PackPlacement[];
}

/**
 * A row of Parts sharing a baseline. Shelves are how a next-fit-decreasing
 * packer keeps rectangles of mixed heights from stranding vertical space: each
 * shelf is as tall as its tallest Part, and short Parts go on a shelf of their
 * own rather than under a tall neighbour.
 */
interface Shelf {
  /** Top edge of the shelf on the Sheet. */
  readonly y: Mm;
  height: Mm;
  /** Left edge of the next free slot. */
  cursorX: Mm;
}

interface Sheet {
  readonly placements: PackPlacement[];
  readonly shelves: Shelf[];
  /** Bottom edge of the lowest shelf. */
  usedHeight: Mm;
}

function newSheet(): Sheet {
  return { placements: [], shelves: [], usedHeight: 0 };
}

/** Can `item` go on `shelf` without leaving the area or making the shelf taller than it is? */
function fitsOnShelf(shelf: Shelf, size: Size, area: Rect, gapMm: Mm): boolean {
  const x = shelf.cursorX === area.x ? area.x : shelf.cursorX + gapMm;
  return x + size.width <= area.x + area.width && size.height <= shelf.height;
}

function placeOnShelf(sheet: Sheet, shelf: Shelf, item: PackItem, area: Rect, gapMm: Mm): void {
  const x = shelf.cursorX === area.x ? area.x : shelf.cursorX + gapMm;
  sheet.placements.push({ item, rect: { x, y: shelf.y, ...item.size } });
  shelf.cursorX = x + item.size.width;
}

function openShelf(sheet: Sheet, item: PackItem, area: Rect, gapMm: Mm): Shelf | undefined {
  const y = sheet.shelves.length === 0 ? area.y : sheet.usedHeight + gapMm;
  if (y + item.size.height > area.y + area.height) return undefined;

  const shelf: Shelf = { y, height: item.size.height, cursorX: area.x };
  sheet.shelves.push(shelf);
  sheet.usedHeight = y + item.size.height;
  return shelf;
}

/**
 * Bin-packs Parts onto as few Sheets as possible: first-fit-decreasing-height,
 * the standard shelf heuristic. Sorting by height first means tall Parts define
 * the shelves and short ones fill the gaps left over, rather than every shelf
 * being as tall as whatever landed on it first.
 */
export function packParts(items: readonly PackItem[], config: PackConfig): readonly PackedSheet[] {
  const area = printableArea(config.paper, config.marginMm);

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
      const shelf = sheet.shelves.find((candidate) =>
        fitsOnShelf(candidate, item.size, area, config.gapMm),
      );
      if (shelf) {
        placeOnShelf(sheet, shelf, item, area, config.gapMm);
        placed = true;
        break;
      }
      const opened = openShelf(sheet, item, area, config.gapMm);
      if (opened) {
        placeOnShelf(sheet, opened, item, area, config.gapMm);
        placed = true;
        break;
      }
    }

    if (placed) continue;

    const sheet = newSheet();
    sheets.push(sheet);
    const shelf = openShelf(sheet, item, area, config.gapMm);
    // Every item was checked against the printable area above, so a fresh
    // Sheet always has room for one.
    if (!shelf) throw new Error('mdcovergen: a Part that fits the paper failed to open a Sheet');
    placeOnShelf(sheet, shelf, item, area, config.gapMm);
  }

  return sheets.map((sheet) => ({ placements: sheet.placements }));
}

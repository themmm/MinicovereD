import type { Track } from '../domain/release.ts';
import type { Mm, Point, Rect } from '../domain/units.ts';
import { ellipsise } from './text.ts';
import type { TextMeasurer } from './text.ts';
import type { TextStyle } from './layout.ts';

/**
 * Fitting a tracklist into the Back Card. The rule the spec sets is simple and
 * strict: flow into two columns, then shrink the type — and never, at any
 * length, drop a track. A collector who cannot find track 23 on the card has a
 * worse object than one whose type is small.
 */

/** Line spacing as a multiple of the type size. */
const LINE_RATIO = 1.2;

/** Space between the two columns, so the lists do not read as one. */
const COLUMN_GAP: Mm = 3;

/** Each shrink step. Small enough to stop close to the largest size that fits. */
const SHRINK_STEP = 0.96;

/**
 * A bound on the search, not on the type. Shrinking is what stops a track from
 * being dropped, so the loop may not give up while tracks are still outside the
 * box — this only guarantees it terminates. 400 steps of 4% reaches 2.4 mm ->
 * 0.0002 mm, far past any list a MiniDisc could hold.
 */
const MAX_SHRINK_STEPS = 400;

/**
 * Sony's own artwork spec puts the minimum character size at 5 pt for this
 * format. Below it, ink spread on a home printer closes up the counters.
 */
export const PRINT_FLOOR_MM: Mm = (5 * 25.4) / 72;

export interface TracklistLine {
  readonly text: string;
  readonly at: Point;
}

export interface TracklistLayout {
  readonly lines: readonly TracklistLine[];
  readonly columns: 1 | 2;
  readonly sizeMm: Mm;
  /** True once the type had to go below what a printer reliably holds. */
  readonly belowPrintFloor: boolean;
}

const linesPerColumn = (boxHeight: Mm, sizeMm: Mm): number =>
  Math.max(0, Math.floor(boxHeight / (sizeMm * LINE_RATIO)));

const fits = (count: number, columns: number, boxHeight: Mm, sizeMm: Mm): boolean =>
  linesPerColumn(boxHeight, sizeMm) * columns >= count;

/**
 * Columns first, then size — because two columns of full-size type read better
 * than one column of small type, and both read better than a truncated list.
 */
function chooseFit(
  count: number,
  box: Rect,
  baseSizeMm: Mm,
): { columns: 1 | 2; sizeMm: Mm } {
  if (fits(count, 1, box.height, baseSizeMm)) return { columns: 1, sizeMm: baseSizeMm };
  if (fits(count, 2, box.height, baseSizeMm)) return { columns: 2, sizeMm: baseSizeMm };

  let sizeMm = baseSizeMm;
  for (let step = 0; step < MAX_SHRINK_STEPS && !fits(count, 2, box.height, sizeMm); step++) {
    sizeMm *= SHRINK_STEP;
  }
  return { columns: 2, sizeMm };
}

export function layOutTracklist(
  tracks: readonly Track[],
  box: Rect,
  baseSizeMm: Mm,
  measure: TextMeasurer,
): TracklistLayout {
  if (tracks.length === 0) {
    return { lines: [], columns: 1, sizeMm: baseSizeMm, belowPrintFloor: false };
  }

  const { columns, sizeMm } = chooseFit(tracks.length, box, baseSizeMm);
  const columnWidth = (box.width - (columns - 1) * COLUMN_GAP) / columns;
  const lineHeight = sizeMm * LINE_RATIO;
  const perColumn = Math.max(1, Math.ceil(tracks.length / columns));

  // Trimming happens against the column, not the box: a title that would fit
  // the full width still has to fit the half it actually gets.
  const style: TextStyle = {
    sizeMm,
    weight: 400,
    color: '#000000',
    align: 'left',
    baseline: 'top',
  };

  const lines = tracks.map((track, index): TracklistLine => {
    const column = Math.min(columns - 1, Math.floor(index / perColumn));
    const row = index - column * perColumn;
    return {
      text: ellipsise(`${track.position}. ${track.title}`, style, columnWidth, measure),
      at: {
        x: box.x + column * (columnWidth + COLUMN_GAP),
        y: box.y + row * lineHeight,
      },
    };
  });

  return { lines, columns, sizeMm, belowPrintFloor: sizeMm < PRINT_FLOOR_MM };
}

import { formatTrackLength } from '../domain/tracklist.ts';
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

/**
 * Space between the longest title a row may set and the times beside it.
 *
 * Fixed rather than proportional to the type: this is the gap that stops a
 * title touching a time, and at 2.4 mm or at 1.8 mm the eye wants about the
 * same absolute distance for that.
 */
const DURATION_GAP: Mm = 2;

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

/**
 * A Track's playing time, set flush against the right edge of the column its
 * row is in — which is what `at.x` is, because `TracklistLayout.durationStyle`
 * is right-aligned.
 *
 * Absent for a Track with no length, and that is the ordinary case rather than
 * the exceptional one: a mixtape typed in from a shelf has no times at all.
 */
export interface TracklistDuration {
  readonly text: string;
  readonly at: Point;
}

export interface TracklistLine {
  readonly text: string;
  readonly at: Point;
  readonly duration?: TracklistDuration;
}

export interface TracklistLayout {
  readonly lines: readonly TracklistLine[];
  readonly columns: 1 | 2;
  /**
   * The style the lines were actually fitted against, with `sizeMm` at whatever
   * the fit settled on. The caller draws with this object rather than building
   * its own, because every field of it is a measurement input: a second literal
   * anywhere is a way for trimming and drawing to disagree, and the disagreement
   * only shows on paper. Handing `face` down fixed one field; handing the style
   * down fixes all of them.
   */
  readonly style: TextStyle;
  /**
   * `style` again, right-aligned: what the duration cells are set in. Handed
   * back for exactly the reason `style` is — a caller that spelled out
   * `{ ...layout.style, align: 'right' }` would be one edit away from spelling
   * out a size too, and then the times would be measured against a list that
   * had since shrunk.
   */
  readonly durationStyle: TextStyle;
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

/**
 * How much of every column the times take: the widest one in the list, plus the
 * gap, or nothing at all when no track has a time.
 *
 * One reserve for the whole list rather than one per row, because that is the
 * difference between a table and a ragged right edge — "1:05" and "1:11:05" in
 * the same list have to end at the same millimetre or neither reads as a time.
 * Measured against the fitted style, which is why this cannot be computed
 * before the fit.
 */
function durationColumnWidth(
  durations: ReadonlyArray<string | undefined>,
  style: TextStyle,
  measure: TextMeasurer,
): Mm {
  const widest = durations.reduce(
    (width, text) => (text ? Math.max(width, measure.widthMm(text, style)) : width),
    0,
  );
  return widest > 0 ? widest + DURATION_GAP : 0;
}

/**
 * Fits `tracks` into `box`, starting from `style` and shrinking only its size.
 *
 * The whole style comes in and the fitted style goes back out, rather than a
 * bare size: trimming *is* measurement, so anything the measurer reads has to
 * be the same on both sides of it. A list fitted at one weight or in one face
 * and drawn at another is cut to a width it never had, and nothing about the
 * layout looks wrong until the Part is on paper.
 */
export function layOutTracklist(
  tracks: readonly Track[],
  box: Rect,
  style: TextStyle,
  measure: TextMeasurer,
): TracklistLayout {
  const baseSizeMm = style.sizeMm;
  if (tracks.length === 0) {
    return {
      lines: [],
      columns: 1,
      style,
      durationStyle: { ...style, align: 'right' },
      belowPrintFloor: false,
    };
  }

  const { columns, sizeMm } = chooseFit(tracks.length, box, baseSizeMm);
  const columnWidth = (box.width - (columns - 1) * COLUMN_GAP) / columns;
  const lineHeight = sizeMm * LINE_RATIO;
  const perColumn = Math.max(1, Math.ceil(tracks.length / columns));

  // Trimming happens against the column, not the box: a title that would fit
  // the full width still has to fit the half it actually gets.
  const fitted: TextStyle = { ...style, sizeMm };
  const durationStyle: TextStyle = { ...fitted, align: 'right' };

  const durations = tracks.map((track) => formatTrackLength(track.lengthMs));
  // Whatever the times take comes off every title in the list, timed or not, or
  // an untimed row would run under the column the timed ones keep clear.
  const reserved = durationColumnWidth(durations, durationStyle, measure);
  const titleWidth = Math.max(0, columnWidth - reserved);

  const lines = tracks.map((track, index): TracklistLine => {
    const column = Math.min(columns - 1, Math.floor(index / perColumn));
    const row = index - column * perColumn;
    const left = box.x + column * (columnWidth + COLUMN_GAP);
    const y = box.y + row * lineHeight;
    const duration = durations[index];

    return {
      text: ellipsise(`${track.position}. ${track.title}`, fitted, titleWidth, measure),
      at: { x: left, y },
      ...(duration ? { duration: { text: duration, at: { x: left + columnWidth, y } } } : {}),
    };
  });

  return {
    lines,
    columns,
    style: fitted,
    durationStyle,
    belowPrintFloor: sizeMm < PRINT_FLOOR_MM,
  };
}

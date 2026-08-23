import { labelNotchDepth, partShape } from '../../domain/parts.ts';
import type { Release } from '../../domain/release.ts';
import { formatTrackLength, totalTrackLength } from '../../domain/tracklist.ts';
import type { Mm, Point, Rect, Size } from '../../domain/units.ts';
import { readableInkFor } from '../colors.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import { drawJCard, drawTracklist, PAD, text } from './shared.ts';
import { ellipsise, wrapText } from '../text.ts';
import type { TextMeasurer } from '../text.ts';
import type { PartDimensions } from '../../domain/parts.ts';
import type { JCardContext, PartContext, PartDrawing, Template, TemplateFaces } from './template.ts';

/**
 * Minimal: type and nothing else. No artwork, and no tint standing in for
 * artwork that was never there.
 *
 * It exists for the Releases nobody looked up. A mixtape has no cover, so
 * `artworkOrPlaceholder` gives Classic's Front Panel a flat tint of the ink
 * where the sleeve would be and gives Full-bleed's the same tint across the
 * whole panel, and both read as a download that failed rather than as a record
 * somebody made. The way to make "no artwork" read as a decision is not to
 * leave the space empty but to spend it: the title is set as large as it will
 * go, hung from the top-left corner, and what is left below it is air on
 * purpose.
 *
 * Three rules hold across the three Parts this Template draws itself:
 *
 *  - **The record is named first.** Album above artist on the Front Panel, the
 *    Back Card and the Label. Classic does it on the Back Card only and
 *    Full-bleed does the opposite. The Spine is not this Template's to order —
 *    `spineLine` is shared, and it reads `artist — album` under all three.
 *  - **Everything hangs from a left edge**, at each Part's own margin: `PAD` on
 *    the J-Card and the Back Card, the tighter `LABEL_PAD` on a 35 mm sticker.
 *    Nothing is centred, because centring needs a shape to be centred in and
 *    this Template has none.
 *  - **One face for all three roles.** See `MINIMAL_TEMPLATE.faces`.
 *
 * And a colour spends itself once. Paper is the J-Card, ink is the type on it;
 * the Back Card is that same card the other way round, the ink as a ground with
 * the list reversed out; and the accent is the two small things a collector
 * finds a disc by — the Spine bar on the shelf, and the Label on the cartridge.
 */

/**
 * The title, set as large as it fits.
 *
 * 11 mm is about 31 pt, which on the panel's 62 mm measure is ten or eleven
 * characters to the line — Noto Sans at 700 averages 0.534 em per character of
 * title case, measured in a browser. Large enough that the panel reads as
 * composed rather than as unfinished, which is the whole job.
 *
 * Three lines is taste, not arithmetic. The height allows five: the fifth
 * line's ink would end at 3 + 4 × 12.1 + 11 = 62.4 mm and the artist under it at
 * 67.6, both still clear of the footer at 79 − 3 − 2.4 = 73.6. But four lines of
 * display type is a paragraph, and a Template whose argument is that the title
 * *is* the design has to stop before the title becomes a body of text.
 *
 * 4.5 mm is where shrinking stops, so that a title cannot go on giving up size
 * until it is smaller than the tracklist on the other card and the panel is
 * back to looking unfinished by a different road.
 */
const HEADLINE_MAX: Mm = 11;
const HEADLINE_MIN: Mm = 4.5;
const HEADLINE_LINES = 3;
/**
 * Line spacing as a multiple of the type size, tighter than the tracklist's
 * 1.2: display type set at 11 mm needs less air between lines than body type
 * at 2.4, and a title with a list's leading reads as three separate titles.
 */
const HEADLINE_LEADING = 1.1;
/**
 * Each shrink step. `chooseFit` uses 0.96 for the same job on the tracklist;
 * this is coarser because a headline has one order of magnitude more room to
 * give and no floor to creep toward one step at a time.
 */
const HEADLINE_STEP = 0.94;

const FRONT_ARTIST_SIZE: Mm = 3;
/** Air between the title's last line and the artist under it. */
const FRONT_ARTIST_GAP: Mm = 2.2;
/** The one line at the foot of the panel, and of the Label. */
const FOOTER_SIZE: Mm = 2.4;

/**
 * What this disc is, in the terms a Release with no artwork actually has:
 * how many tracks, and how long they run when every one of them says.
 *
 * The second anchor of the composition as well as a fact. Type at the top and
 * type at the foot make the space between them read as air; type at the top
 * alone makes it read as the rest of the panel.
 *
 * Empty for a Release with no tracks, and no footer is then drawn at all —
 * "0 tracks" is a claim about a record rather than the absence of one, which is
 * the same reason `formatTrackLength` refuses to print `0:00`.
 */
function discLine(release: Release): string {
  const count = release.tracks.length;
  if (count === 0) return '';

  const running = formatTrackLength(totalTrackLength(release.tracks));
  return [count === 1 ? '1 track' : `${count} tracks`, running].filter(Boolean).join(' · ');
}

/**
 * What the Release is called, and what goes under that.
 *
 * Ordinarily the album is the title and the artist is the line below it. A
 * Release with no album has the artist promoted into the title instead, rather
 * than a blank where the design's largest type goes — the same move `spineLine`
 * makes when it filters the empties and joins what is left. A mixtape typed in
 * with only a name on it is exactly the Release this Template exists for.
 */
function naming(release: Release): { readonly title: string; readonly under: string } {
  return release.album
    ? { title: release.album, under: release.artist }
    : { title: release.artist, under: '' };
}

/** A title broken into lines, with the size those lines were broken at. */
interface Headline {
  readonly lines: readonly string[];
  /**
   * Handed back with the lines for the reason `layOutTracklist` hands its style
   * back: the size is what the wrap was measured against, so a caller drawing
   * from a second literal would draw lines fitted to a width they never had.
   */
  readonly style: TextStyle;
  /**
   * Distance from one line's top to the next, derived once here rather than
   * where each reader needs it. Two derivations of the same number is how the
   * block and the thing hanging off its bottom come to disagree about where the
   * bottom is, and only paper shows it.
   */
  readonly leading: Mm;
}

/**
 * `content` wrapped to at most `HEADLINE_LINES` lines, at the largest size
 * between `HEADLINE_MAX` and `HEADLINE_MIN` that manages it.
 *
 * Size is given up for **line count only**, and whatever still overhangs the
 * measure is ellipsised at the size the line count settled on.
 *
 * The order looks like `chooseFit`'s and is not it: the tracklist spends a
 * second column, then shrinks without a floor, and never loses a track. This
 * has a floor, so something has to give at it, and the something is words. What
 * matters is which lever is pulled for which problem. Too many lines is a
 * problem shrinking solves. A single word wider than the panel is not —
 * `wrapText` will not break inside a word, so no amount of shrinking above the
 * floor makes that line fit, and shrinking for it drags every *other* line of
 * the title down with it. One unbreakable word would set a whole title at
 * 4.5 mm to no purpose. So the word is cut instead, at the size the rest of the
 * title wanted, which is the same trade `SPINE_SIZE_MM` makes on the Spine: the
 * type holds and the line is truncated.
 *
 * Every line comes back through `ellipsise`, which is what makes each of them a
 * string the measurer was asked about in the face it is drawn in — and what
 * gathers the words past the third line onto the third rather than dropping
 * them off the end, because a line that stops without an ellipsis is a title
 * the collector has no way of knowing was cut.
 */
function fitHeadline(
  content: string,
  base: TextStyle,
  maxWidthMm: Mm,
  measure: TextMeasurer,
): Headline {
  let sizeMm = base.sizeMm;
  for (;;) {
    const style: TextStyle = { ...base, sizeMm };
    const lines = wrapText(content, style, maxWidthMm, measure);

    if (lines.length <= HEADLINE_LINES || sizeMm <= HEADLINE_MIN) {
      const overflow = lines.slice(HEADLINE_LINES - 1).join(' ');
      const kept = [...lines.slice(0, HEADLINE_LINES - 1), ...(overflow ? [overflow] : [])];
      return {
        lines: kept.map((line) => ellipsise(line, style, maxWidthMm, measure)),
        style,
        leading: sizeMm * HEADLINE_LEADING,
      };
    }
    sizeMm = Math.max(HEADLINE_MIN, sizeMm * HEADLINE_STEP);
  }
}

/** Where the ink of the last line ends, which is what the artist hangs off. */
function headlineBottom(headline: Headline, top: Mm): Mm {
  if (headline.lines.length === 0) return top;
  return top + (headline.lines.length - 1) * headline.leading + headline.style.sizeMm;
}

/**
 * The one line at the foot of a Part, or nothing when the Release has no facts
 * to put there. Written once because the Front Panel and the Label carry the
 * same line for the same reason, in the same role, and a second style literal
 * is a second thing to keep in step.
 */
function footerOps(
  release: Release,
  faces: TemplateFaces,
  at: Point,
  ink: string,
  maxWidthMm: Mm,
  measure: TextMeasurer,
): DrawOp[] {
  const line = discLine(release);
  if (!line) return [];

  // A caption rather than a heading, so it takes the body role.
  const style: TextStyle = { sizeMm: FOOTER_SIZE, weight: 400, face: faces.text, color: ink, align: 'left', baseline: 'top' };
  return [text(line, at, style, maxWidthMm, measure)];
}

/**
 * The Front Panel: paper, the title as large as it goes, the artist under it
 * and one line of facts at the foot.
 *
 * No logo here, which is the one thing "type and nothing else" can actually
 * mean on this Part. The Spine's is not Minimal's to drop: a shelved case has
 * to be identifiable, ADR-0004 makes the mark a bundled default and ADR-0008
 * records the Spine as what carries it. A second placement is another matter —
 * on a panel whose whole argument is that it carries no picture, it would be
 * the picture. The collector who wants neither still has the toggle.
 */
function drawFrontPanel({ release, params, faces, measure }: PartContext, panel: Rect): DrawOp[] {
  const left = panel.x + PAD;
  // Clamped, because a project file may carry a 1 mm J-Card and a negative
  // measure is not a narrower column.
  const room = Math.max(0, panel.width - 2 * PAD);
  const top = panel.y + PAD;
  const { title, under } = naming(release);

  const headline = fitHeadline(
    title,
    {
      sizeMm: HEADLINE_MAX,
      weight: 700,
      face: faces.display,
      color: params.inkColor,
      align: 'left',
      baseline: 'top',
    },
    room,
    measure,
  );

  const artistStyle: TextStyle = { sizeMm: FRONT_ARTIST_SIZE, weight: 400, face: faces.display, color: params.inkColor, align: 'left', baseline: 'top' };

  return [
    { op: 'fill-rect', rect: panel, color: params.paperColor },
    // Drawn with the style and the leading the fit settled on, never with a
    // fresh literal of either.
    ...headline.lines.map(
      (line, index): DrawOp => ({
        op: 'text',
        text: line,
        at: { x: left, y: top + index * headline.leading },
        style: headline.style,
      }),
    ),
    // Not gated on `showOverlayText`: that parameter governs type drawn over
    // artwork, and this Template has none for type to be over.
    ...(under
      ? [
          text(
            under,
            { x: left, y: headlineBottom(headline, top) + FRONT_ARTIST_GAP },
            artistStyle,
            room,
            measure,
          ),
        ]
      : []),
    ...footerOps(
      release,
      faces,
      { x: left, y: panel.y + panel.height - PAD - FOOTER_SIZE },
      params.inkColor,
      room,
      measure,
    ),
  ];
}

/**
 * The Back Card's heading: the album at twice the artist, hung from `PAD` at
 * the top-left. 3 + 4.8 puts the album's ink at 7.8, the artist starts 1.2
 * below that and is 2.4 tall, so the heading is done at 11.4.
 */
const BACK_ALBUM_SIZE: Mm = 4.8;
const BACK_ARTIST_SIZE: Mm = 2.4;
const BACK_ARTIST_TOP: Mm = 9;
/** Where the list starts: the artist's ink ends at 11.4, so this leaves 4.6 mm of air. */
const BACK_LIST_TOP: Mm = 16;

/**
 * The Back Card: the Front Panel printed the other way round. The ink stops
 * being the type and becomes the ground; the heading keeps the same order and
 * the same left edge; and the list fills the space the front leaves as air.
 *
 * The ink rather than the accent because that inversion is the only gesture
 * this Template makes, and it needs the two colours the type is already made
 * of. The accent has the Spine and the Label, which is where a collector looks
 * to find a disc; this is the card they read once it is in their hand.
 *
 * The list starts at 16 rather than at Classic's 19 or Full-bleed's 18: there
 * is no band here and no centred title block, so the heading takes as little of
 * the card as it can and the tracklist gets the rest.
 */
function drawBackCard(context: PartContext): PartDrawing {
  const { release, params, size, faces, measure } = context;
  const ground = params.inkColor;
  // Chosen rather than configured, exactly as on the Spine and on the other two
  // Back Cards: no pair of colours a collector picks may produce a list that
  // cannot be read.
  const ink = readableInkFor(ground);
  const room = size.width - 2 * PAD;

  const { title, under } = naming(release);
  const albumStyle: TextStyle = { sizeMm: BACK_ALBUM_SIZE, weight: 700, face: faces.display, color: ink, align: 'left', baseline: 'top' };
  const artistStyle: TextStyle = { sizeMm: BACK_ARTIST_SIZE, weight: 400, face: faces.display, color: ink, align: 'left', baseline: 'top' };

  const tracklist = drawTracklist(
    context,
    {
      x: PAD,
      y: BACK_LIST_TOP,
      width: room,
      height: size.height - BACK_LIST_TOP - PAD,
    },
    ink,
  );

  return {
    ops: [
      { op: 'fill-rect', rect: { x: 0, y: 0, width: size.width, height: size.height }, color: ground },
      text(title, { x: PAD, y: PAD }, albumStyle, room, measure),
      ...(under ? [text(under, { x: PAD, y: BACK_ARTIST_TOP }, artistStyle, room, measure)] : []),
      ...tracklist.ops,
    ],
    ...(tracklist.warnings ? { warnings: tracklist.warnings } : {}),
  };
}

const LABEL_PAD: Mm = 2.5;
const LABEL_ALBUM_SIZE: Mm = 2.8;
const LABEL_ARTIST_SIZE: Mm = 2.2;
/** Air between the two heading lines on the Label. */
const LABEL_HEADING_GAP: Mm = 1;

/**
 * How wide a line whose top sits at `top` may be set before it runs into the
 * cartridge's cut corner.
 *
 * The cut runs x = (width − notch) + y from the top edge down to y = notch, so
 * the limit is tightest at the line's own top and opens as the line descends;
 * a line starting below the notch has no limit but the margin. Reserving the
 * notch's full width from every line instead would cost 6 mm of a 35 mm sticker
 * to a corner that is 6 mm deep at its worst and gone by the second line.
 */
function labelRoom(size: Size, dimensions: PartDimensions, top: Mm): Mm {
  const notch = labelNotchDepth(dimensions.label);
  const right = notch > 0
    ? Math.min(size.width - LABEL_PAD, size.width - notch + top)
    : size.width - LABEL_PAD;
  return Math.max(0, right - LABEL_PAD);
}

/**
 * The Label: a chip of the accent with the name in the corner and the same
 * footer the Front Panel carries.
 *
 * Solid colour because that is what a sticker on a cartridge is for — the one
 * Part looked at from above, in a box of forty identical cartridges, and colour
 * is what is legible from there. It is also where the accent goes on this
 * Template, the Spine being the only other place it appears.
 */
function drawLabel({ release, params, size, dimensions, faces, measure }: PartContext): DrawOp[] {
  const ground = params.accentColor;
  const ink = readableInkFor(ground);

  const artistTop = LABEL_PAD + LABEL_ALBUM_SIZE + LABEL_HEADING_GAP;
  const footerTop = size.height - LABEL_PAD - FOOTER_SIZE;

  const { title, under } = naming(release);
  const albumStyle: TextStyle = { sizeMm: LABEL_ALBUM_SIZE, weight: 700, face: faces.display, color: ink, align: 'left', baseline: 'top' };
  const artistStyle: TextStyle = { sizeMm: LABEL_ARTIST_SIZE, weight: 400, face: faces.display, color: ink, align: 'left', baseline: 'top' };

  return [
    // Cut to the outline rather than filled as a rectangle: the notched corner
    // is not sticker, and a chip is exactly the shape of the paper it is on.
    { op: 'fill-polygon', points: partShape('label', dimensions).outline, color: ground },
    text(
      title,
      { x: LABEL_PAD, y: LABEL_PAD },
      albumStyle,
      labelRoom(size, dimensions, LABEL_PAD),
      measure,
    ),
    ...(under
      ? [
          text(
            under,
            { x: LABEL_PAD, y: artistTop },
            artistStyle,
            labelRoom(size, dimensions, artistTop),
            measure,
          ),
        ]
      : []),
    ...footerOps(
      release,
      faces,
      { x: LABEL_PAD, y: footerTop },
      ink,
      labelRoom(size, dimensions, footerTop),
      measure,
    ),
  ];
}

export const MINIMAL_TEMPLATE: Template = {
  id: 'minimal',
  name: 'Minimal',
  description: 'Type only: no artwork, the title as large as it fits, the list on colour.',
  /**
   * One face, in all three roles, and it is the neutral one.
   *
   * The three roles exist so a Template's voice is more than a single choice
   * (`TemplateFaces`), and this is the Template that declines to spend them.
   * Hierarchy here is size, weight and space and nothing else — the rule
   * ADR-0008 sets for the chrome, applied to paper — and a second typeface on a
   * Part that carries no picture would be the ornament this design exists to
   * refuse.
   *
   * Noto Sans rather than one of the five voices because it is the only bundled
   * face that ships past Latin-ext: Greek, Cyrillic, Vietnamese and Devanagari
   * as well. Minimal is the Template for a Release nobody looked up — typed in
   * from a shelf, in whatever script the shelf is in — and under any other
   * Template such a title falls out of the named face into the Noto fallback
   * partway along the line, which is a face change inside one title and
   * permanent once the Part is cut. Japanese still falls through here too: none
   * of the six voices covers CJK, which is why every stack in
   * `PRINT_FONT_STACKS` passes through Noto Sans JP before its generic keyword.
   *
   * The cost is the Spine, which gives up the condensed face Classic uses there
   * and so cuts a long line sooner — Archivo Narrow sets `Glen Campbell —
   * Wichita Lineman` 20.3 % narrower, measured in this browser. Reported rather than hidden
   * (`SpineTruncated`), and the trade is deliberate: the Spine is one line of
   * the collector's own words, and setting it in the face that can render them
   * beats setting 20 % more of them in a face that cannot.
   */
  faces: { display: 'sans', text: 'sans', spine: 'sans' },
  drawJCard: (context: JCardContext) => drawJCard(context, drawFrontPanel),
  drawBackCard,
  drawLabel: (context: PartContext) => ({ ops: drawLabel(context) }),
};

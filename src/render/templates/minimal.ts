import { partShape } from '../../domain/parts.ts';
import type { Release } from '../../domain/release.ts';
import { formatTrackLength, totalTrackLength } from '../../domain/tracklist.ts';
import type { Mm, Rect } from '../../domain/units.ts';
import { readableInkFor } from '../colors.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import { drawJCard, drawTracklist, PAD, text } from './shared.ts';
import { ellipsise, wrapText } from '../text.ts';
import type { TextMeasurer } from '../text.ts';
import type { JCardContext, PartContext, PartDrawing, Template } from './template.ts';

/**
 * Minimal: type and nothing else. No artwork, and no tint standing in for
 * artwork that was never there.
 *
 * It exists for the Releases nobody looked up. A mixtape has no cover, so
 * `artworkOrPlaceholder` gives Classic a flat tint of the ink where the sleeve
 * would be and gives Full-bleed the same tint across the whole Part, and both
 * read as a download that failed rather than as a record somebody made. The way to make "no artwork" read as a decision is not
 * to leave the space empty but to spend it: the album title is set as large as
 * it will go, hung from the top-left corner, and what is left below it is air
 * on purpose.
 *
 * Three rules hold across every Part:
 *
 *  - **The record is named first.** Album above artist, everywhere — the Front
 *    Panel, the Back Card and the Label. Classic does it on the Back Card only
 *    and Full-bleed does the opposite; here it is the Template's one ordering.
 *  - **Everything hangs from one left edge**, at `PAD`. Nothing is centred,
 *    because centring needs a shape to be centred in and this Template has no
 *    shapes.
 *  - **One face for all three roles.** See `MINIMAL_TEMPLATE.faces`.
 *
 * And a colour spends itself once: paper carries the J-Card, the ink carries
 * the Back Card with the list reversed out of it — the same page printed the
 * other way round — and the accent carries the two small things a collector
 * finds the disc by, the Spine on the shelf and the Label on the cartridge.
 */

/**
 * The title, set as large as it fits.
 *
 * 11 mm is about 31 pt, which on a 68 mm panel is around eleven characters to
 * the line — large enough that the panel reads as composed rather than as
 * unfinished, which is the whole job. Three lines is what 79 mm of height can
 * carry above the artist and still leave the air below deliberate: the third
 * line's ink ends at 3 + 2 × 12.1 + 11 = 38.2 mm, and the footer does not start
 * until 79 − 3 − 2.4 = 73.6.
 *
 * 4.5 mm is where shrinking stops. Below it the title is no longer the design
 * and something has to give instead, so the last line takes an ellipsis and
 * says so — a title set at 3 mm on an otherwise empty panel would be the
 * failed-download look arrived at by a different road.
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
/** Each shrink step, as in `layOutTracklist` — small enough to stop near the largest size that fits. */
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

/** A title broken into lines, with the size those lines were broken at. */
interface Headline {
  readonly lines: readonly string[];
  /**
   * Handed back with the lines for the reason `layOutTracklist` hands its style
   * back: the size is what the wrap was measured against, so a caller drawing
   * from a second literal would draw lines fitted to a width they never had.
   */
  readonly style: TextStyle;
}

/**
 * `content` wrapped to at most `HEADLINE_LINES` lines, at the largest size
 * between `HEADLINE_MAX` and `HEADLINE_MIN` that manages it.
 *
 * The same order the tracklist gives way in (`chooseFit`): spend the room first
 * — a second and a third line, as the list spends a second column — then the
 * size, and only then lose something. At the floor the words that will not fit
 * are gathered onto the last line and ellipsised there, rather than dropped off
 * the end of it: a line that stops without an ellipsis is a title the collector
 * has no way of knowing was cut.
 *
 * Fitting is both halves of it: few enough lines, and no line overhanging the
 * measure. `wrapText` will not break inside a word, so a one-word title longer
 * than the panel comes back as a single line that is off the Part, and a check
 * on the line count alone would accept it. Measuring the lines here is also
 * what makes every string this returns one the measurer was asked about in the
 * face it is drawn in.
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
    const fits =
      lines.length <= HEADLINE_LINES &&
      lines.every((line) => measure.widthMm(line, style) <= maxWidthMm);
    if (fits) return { lines, style };

    if (sizeMm <= HEADLINE_MIN) {
      const rest = lines.slice(HEADLINE_LINES - 1).join(' ');
      return {
        lines: [
          ...lines.slice(0, HEADLINE_LINES - 1),
          ...(rest ? [rest] : []),
        ].map((line) => ellipsise(line, style, maxWidthMm, measure)),
        style,
      };
    }
    sizeMm = Math.max(HEADLINE_MIN, sizeMm * HEADLINE_STEP);
  }
}

/** Where the ink of the last line ends, which is what the artist hangs off. */
function headlineBottom(headline: Headline, top: Mm): Mm {
  if (headline.lines.length === 0) return top;
  const leading = headline.style.sizeMm * HEADLINE_LEADING;
  return top + (headline.lines.length - 1) * leading + headline.style.sizeMm;
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

  const headline = fitHeadline(
    release.album,
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
  const leading = headline.style.sizeMm * HEADLINE_LEADING;

  const artistStyle: TextStyle = { sizeMm: FRONT_ARTIST_SIZE, weight: 400, face: faces.display, color: params.inkColor, align: 'left', baseline: 'top' };
  // The footer is a caption rather than a heading, so it takes the body role.
  const footerStyle: TextStyle = { sizeMm: FOOTER_SIZE, weight: 400, face: faces.text, color: params.inkColor, align: 'left', baseline: 'top' };
  const footer = discLine(release);

  return [
    { op: 'fill-rect', rect: panel, color: params.paperColor },
    // Drawn with the style the fit settled on, never with a fresh literal.
    ...headline.lines.map(
      (line, index): DrawOp => ({
        op: 'text',
        text: line,
        at: { x: left, y: top + index * leading },
        style: headline.style,
      }),
    ),
    // Not gated on `showOverlayText`: that parameter governs type drawn over
    // artwork, and this Template has none for type to be over.
    text(
      release.artist,
      { x: left, y: headlineBottom(headline, top) + FRONT_ARTIST_GAP },
      artistStyle,
      room,
      measure,
    ),
    ...(footer
      ? [
          text(
            footer,
            { x: left, y: panel.y + panel.height - PAD - FOOTER_SIZE },
            footerStyle,
            room,
            measure,
          ),
        ]
      : []),
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
 * is no band here and no centred title page, so the heading takes as little of
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
      text(release.album, { x: PAD, y: PAD }, albumStyle, room, measure),
      text(release.artist, { x: PAD, y: BACK_ARTIST_TOP }, artistStyle, room, measure),
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
 * The Label: a chip of the accent with the name in the corner and the same
 * footer the Front Panel carries.
 *
 * Solid colour because that is what a sticker on a cartridge is for — the one
 * Part looked at from above, in a box of forty identical cartridges, and colour
 * is what is legible from there. It is also where the accent goes on this
 * Template, the Spine being the only other place it appears.
 */
function drawLabel({ release, params, size, dimensions, faces, measure }: PartContext): DrawOp[] {
  const { notch, notchSize } = dimensions.label;
  const ground = params.accentColor;
  const ink = readableInkFor(ground);

  // The diagonal runs x = (width - notchSize) + y down to y = notchSize, so the
  // heading block, which starts inside that band, holds the notch's own width
  // clear of the right edge — more than the diagonal takes at any y, which is
  // what keeps both lines clear of it. The footer sits at the other end of the
  // Label, well below the cut, and gets the full measure.
  const headingRoom = Math.max(0, size.width - 2 * LABEL_PAD - (notch ? notchSize : 0));
  const footerRoom = Math.max(0, size.width - 2 * LABEL_PAD);

  const albumStyle: TextStyle = { sizeMm: LABEL_ALBUM_SIZE, weight: 700, face: faces.display, color: ink, align: 'left', baseline: 'top' };
  const artistStyle: TextStyle = { sizeMm: LABEL_ARTIST_SIZE, weight: 400, face: faces.display, color: ink, align: 'left', baseline: 'top' };
  const footerStyle: TextStyle = { sizeMm: FOOTER_SIZE, weight: 400, face: faces.text, color: ink, align: 'left', baseline: 'top' };
  const footer = discLine(release);

  return [
    // Cut to the outline rather than filled as a rectangle: the notched corner
    // is not sticker, and a chip is exactly the shape of the paper it is on.
    { op: 'fill-polygon', points: partShape('label', dimensions).outline, color: ground },
    text(release.album, { x: LABEL_PAD, y: LABEL_PAD }, albumStyle, headingRoom, measure),
    text(
      release.artist,
      { x: LABEL_PAD, y: LABEL_PAD + LABEL_ALBUM_SIZE + LABEL_HEADING_GAP },
      artistStyle,
      headingRoom,
      measure,
    ),
    ...(footer
      ? [
          text(
            footer,
            { x: LABEL_PAD, y: size.height - LABEL_PAD - FOOTER_SIZE },
            footerStyle,
            footerRoom,
            measure,
          ),
        ]
      : []),
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
   * permanent once the Part is cut. Japanese still falls through here too; no
   * bundled voice covers CJK, and `PRINT_FONT_STACKS` ends every stack with
   * Noto Sans JP for exactly that.
   *
   * The cost is the Spine, which gives up the condensed face Classic uses there
   * and so cuts a long line sooner — Archivo Narrow sets that line 20.4 %
   * narrower, measured in a browser. Reported rather than hidden
   * (`SpineTruncated`), and the trade is deliberate: the Spine is one line of
   * the collector's own words, and setting it in the face that can render them
   * beats setting 20 % more of them in a face that cannot.
   */
  faces: { display: 'sans', text: 'sans', spine: 'sans' },
  drawJCard: (context: JCardContext) => drawJCard(context, drawFrontPanel),
  drawBackCard,
  drawLabel: (context: PartContext) => ({ ops: drawLabel(context) }),
};

import { labelShape } from '../../domain/parts.ts';
import type { Release, Track } from '../../domain/release.ts';
import type { Mm, Rect } from '../../domain/units.ts';
import { readableInkFor } from '../colors.ts';
import type { DrawOp, TextStyle } from '../layout.ts';
import {
  artworkOrPlaceholder,
  drawArtworkBackCover,
  drawCredits,
  drawInsert,
  drawTracklist,
  FRONT_LOGO_WIDTH,
  hasArtworkBackCover,
  logoOp,
  PAD,
  text,
} from './shared.ts';
import type { InsertContext, PartContext, PartDrawing, Template } from './template.ts';

/**
 * Classic: a book. The artwork runs to three edges of the Front Panel with the
 * type on solid paper below it; the tracklist Page is a title page — the
 * Release's accent, edge to edge, with everything reversed out of it — and the
 * credits Page is the colophon at the back, set on paper.
 *
 * The colophon is the one place this Template goes back to paper after the title
 * page, and that is the whole reason it reads as a book rather than as two
 * coloured cards: a title page is colour and a colophon is not. Two Pages of the
 * same accent ground would have made the Insert's interior one surface with a
 * fold in it.
 *
 * The counterpart to Full-bleed, where the artwork covers the Part entirely and
 * the type sits on top of the picture rather than beside it.
 */

/**
 * The band of paper the type sits on, under bled artwork.
 *
 * Sized by what has to go in it rather than by eye: the artist line starts
 * 2.4 mm below the artwork and is 4 mm tall, the album starts 4.8 mm after that
 * and is 3.2 mm tall, and `PAD` closes the panel — 2.4 + 4 + 0.8 + 3.2 + 3 =
 * 13.4. The logo is the other tenant and wants 8.73 mm plus its own `PAD`, so
 * 14 clears both with a little air.
 */
const CAPTION_BAND: Mm = 14;

/** Where the caption sits under the artwork, and how big each line is. */
const ARTIST_SIZE: Mm = 4;
const ALBUM_SIZE: Mm = 3.2;
const ARTIST_GAP: Mm = 2.4;
const ALBUM_GAP: Mm = 7.2;

/**
 * Where the artwork goes on the Front Panel.
 *
 * Bled, it takes the panel's whole width and everything above the caption band,
 * so it meets the top, the left and the right — the fourth edge is the type's,
 * and there is no bleed allowance anywhere (spec: the artwork edge is the cut
 * line). Inset, it is v1's square: `PAD` on all four sides of the panel's width.
 *
 * Both are clamped at zero, because a project file may carry a 1 mm Insert and
 * a negative rectangle is not a smaller picture.
 */
function artworkRect(panel: Rect, inset: boolean): Rect {
  if (inset) {
    const side = Math.max(0, panel.width - 2 * PAD);
    return { x: panel.x + PAD, y: panel.y + PAD, width: side, height: side };
  }
  return {
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: Math.max(0, panel.height - CAPTION_BAND),
  };
}

function drawFrontPanel({ release, params, faces, measure }: PartContext, panel: Rect): DrawOp[] {
  const art = artworkRect(panel, params.insetArtwork);
  const artBottom = art.y + art.height;

  // The logo takes the bottom-right corner, so the caption gets the rest of the
  // width and centres in that — otherwise a long artist runs straight through
  // the mark, which no amount of ellipsising alone would prevent.
  const logoColumn = params.showLogo ? FRONT_LOGO_WIDTH + PAD : 0;
  const captionLeft = panel.x + PAD;
  const captionWidth = panel.width - 2 * PAD - logoColumn;
  const captionCentre = captionLeft + captionWidth / 2;

  const artistStyle: TextStyle = { sizeMm: ARTIST_SIZE, weight: 700, face: faces.display, color: params.inkColor, align: 'center', baseline: 'top' };
  const albumStyle: TextStyle = { sizeMm: ALBUM_SIZE, weight: 400, face: faces.display, color: params.inkColor, align: 'center', baseline: 'top' };

  return [
    // Under the artwork either way: bled, this is the band the type sets on;
    // inset, it is the margin around the square.
    { op: 'fill-rect', rect: panel, color: params.paperColor },
    artworkOrPlaceholder(release, art, params),
    // Not gated on `showOverlayText`, which governs type drawn *over* artwork —
    // the Full-bleed Front Panel and Label, as that parameter says. This
    // caption is beside the artwork, exactly as the Classic Label's is, and was
    // gated by an oversight that only became visible here: with the artwork
    // bled, switching the toggle off left 14 mm of blank paper where the
    // Release's name goes.
    text(release.artist, { x: captionCentre, y: artBottom + ARTIST_GAP }, artistStyle, captionWidth, measure),
    text(release.album, { x: captionCentre, y: artBottom + ALBUM_GAP }, albumStyle, captionWidth, measure),
    ...logoOp(
      params,
      { x: panel.x + panel.width - PAD - FRONT_LOGO_WIDTH, y: panel.y + panel.height - PAD },
      FRONT_LOGO_WIDTH,
      params.inkColor,
    ),
  ];
}

function drawLabel({ release, params, size, dimensions, faces, measure }: PartContext): DrawOp[] {
  const pad: Mm = 2.5;
  // The diagonal runs x = (width - notch) + y, so a square inset by `pad` on
  // every side would poke through it at the top right. Sizing the square to
  // clear the diagonal keeps the artwork whole.
  const { notchSize } = dimensions.label;
  const artSide = Math.min(size.width - 2 * pad, size.width - notchSize - pad);
  const artLeft = (size.width - artSide) / 2;

  const artistStyle: TextStyle = { sizeMm: 2.8, weight: 700, face: faces.display, color: params.inkColor, align: 'center', baseline: 'top' };
  const albumStyle: TextStyle = { sizeMm: 2.4, weight: 400, face: faces.display, color: params.inkColor, align: 'center', baseline: 'top' };
  const centreX = size.width / 2;
  const textWidth = size.width - 2 * pad;

  // Centre the caption in whatever room the artwork leaves, so the Label reads
  // as one block instead of drifting to the top edge.
  const captionHeight = artistStyle.sizeMm + 1 + albumStyle.sizeMm;
  const captionTop = pad + artSide + (size.height - pad - (pad + artSide) - captionHeight) / 2;

  return [
    { op: 'fill-polygon', points: labelShape(dimensions.label).outline, color: params.paperColor },
    artworkOrPlaceholder(release, { x: artLeft, y: pad, width: artSide, height: artSide }, params),
    // Beside the artwork rather than on top of it, so `showOverlayText` — which
    // governs type over artwork — leaves this caption alone.
    text(release.artist, { x: centreX, y: captionTop }, artistStyle, textWidth, measure),
    text(release.album, { x: centreX, y: captionTop + artistStyle.sizeMm + 1 }, albumStyle, textWidth, measure),
  ];
}

/** The tracklist Page's heading, above the list. Album first: this is a title page. */
const PAGE_ALBUM_SIZE: Mm = 3.8;
const PAGE_ARTIST_SIZE: Mm = 2.6;
const PAGE_ALBUM_TOP: Mm = 6;
const PAGE_ARTIST_TOP: Mm = 10.8;
/** Where the list starts, leaving 5.6 mm of air under the artist line. */
const PAGE_LIST_TOP: Mm = 19;

/**
 * The tracklist Page: the Release's accent as a full-bleed ground, the album and
 * the artist centred at the top, and the tracklist reversed out below them.
 *
 * The accent rather than the ink because the Spine bar is already the accent, so
 * the Page a collector opens the case to and the edge that shows on the shelf are
 * the one colour — the two halves of the same object, printed the same. Classic's
 * paper stays paper on the Front Panel, on the colophon and on the Label, which
 * is what makes this Page read as a different surface rather than as more of the
 * same.
 *
 * Centred, and the album above the artist: a title page names the work first and
 * centres it, which is the whole of what "Classic is a book" means here. There is
 * no rule under the heading — a 0.2 mm hairline dividing two things that a 5.6 mm
 * gap already divides was decoration.
 */
function drawTracklistPage(context: PartContext, page: Rect, tracks: readonly Track[]): PartDrawing {
  const { release, params, faces, measure } = context;
  const ground = params.accentColor;
  // Chosen rather than configured, exactly as on the Spine: a collector is free
  // to pick a dark accent and dark ink, and no combination may produce a Page
  // whose tracklist cannot be read.
  const ink = readableInkFor(ground);
  const contentWidth = page.width - 2 * PAD;
  const centreX = page.x + page.width / 2;

  const albumStyle: TextStyle = { sizeMm: PAGE_ALBUM_SIZE, weight: 700, face: faces.display, color: ink, align: 'center', baseline: 'top' };
  const artistStyle: TextStyle = { sizeMm: PAGE_ARTIST_SIZE, weight: 400, face: faces.display, color: ink, align: 'center', baseline: 'top' };

  const tracklist = drawTracklist(
    context,
    {
      x: page.x + PAD,
      y: page.y + PAGE_LIST_TOP,
      width: contentWidth,
      height: page.height - PAGE_LIST_TOP - PAD,
    },
    ink,
    tracks,
  );

  return {
    ops: [
      { op: 'fill-rect', rect: page, color: ground },
      text(release.album, { x: centreX, y: page.y + PAGE_ALBUM_TOP }, albumStyle, contentWidth, measure),
      text(release.artist, { x: centreX, y: page.y + PAGE_ARTIST_TOP }, artistStyle, contentWidth, measure),
      ...tracklist.ops,
    ],
    ...(tracklist.warnings ? { warnings: tracklist.warnings } : {}),
  };
}

/** The colophon's one word, and the air under it before the block starts. */
const COLOPHON_HEADING_SIZE: Mm = 2.8;
const COLOPHON_BLOCK_TOP: Mm = 9;

/**
 * The credits Page: a colophon on paper, headed by one word and ranged left.
 *
 * Ranged left where the title page is centred, because this is the Page that is
 * read rather than looked at — a colophon is a table of who did what, and a
 * centred table has no edge for the eye to come back to. Which is also why the
 * one word at the top is small: it is a label on a block, not a title.
 */
function drawCreditsPage(context: PartContext, page: Rect): PartDrawing {
  const { params, faces } = context;
  const headingStyle: TextStyle = {
    sizeMm: COLOPHON_HEADING_SIZE,
    weight: 700,
    face: faces.display,
    color: params.inkColor,
    align: 'left',
    baseline: 'top',
  };
  const block = drawCredits(
    context,
    {
      x: page.x + PAD,
      y: page.y + COLOPHON_BLOCK_TOP,
      width: page.width - 2 * PAD,
      height: page.height - COLOPHON_BLOCK_TOP - PAD,
    },
    params.inkColor,
  );

  return {
    ops: [
      { op: 'fill-rect', rect: page, color: params.paperColor },
      { op: 'text', text: 'Credits', at: { x: page.x + PAD, y: page.y + PAD }, style: headingStyle },
      ...block.ops,
    ],
    ...(block.warnings ? { warnings: block.warnings } : {}),
  };
}

export const CLASSIC_TEMPLATE: Template = {
  id: 'classic',
  name: 'Classic',
  description: 'Artwork to three edges, type on paper below, tracklist on colour.',
  // `insetArtwork` reaches the Front Panel and nowhere else — `artworkRect`
  // above; the Label's square is sized around the cartridge's cut corner
  // instead. `showLogo` reaches the Front Panel here *and* the Spine, through
  // the shared `drawInsert` below, where it also shortens the line the Spine has
  // room for. Nothing Classic sets is drawn over artwork, which is what
  // `showOverlayText` governs, so this Template never reads that one.
  toggles: ['showLogo', 'insetArtwork'],
  /**
   * A book: a serif over the artwork, a humanist for the reading, and the
   * narrow grotesque on the Spine where every character costs width.
   *
   * Source Serif 4 rather than a Garamond because type here goes down to 2.4 mm
   * and Sony's artwork spec puts the printable stroke floor at 0.15 mm
   * (ADR-0008 rule 6) — an old-style face's hairlines fall under it and a
   * low-contrast one engineered for text does not. Cabin below it is
   * Gill-flavoured, which is the one humanist voice that does not read as a
   * second helping of Noto.
   */
  faces: { display: 'serif', text: 'humanist', spine: 'condensed' },
  // The artwork again, so the back cover exists exactly when there is artwork to
  // put on it (ADR-0012's odd Page out).
  hasBackCover: (release: Release) => hasArtworkBackCover(release),
  drawInsert: (context: InsertContext) =>
    drawInsert(context, {
      cover: drawFrontPanel,
      tracklist: drawTracklistPage,
      credits: drawCreditsPage,
      backCover: drawArtworkBackCover,
    }),
  drawLabel: (context: PartContext) => ({ ops: drawLabel(context) }),
};
